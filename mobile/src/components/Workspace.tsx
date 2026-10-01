"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ThemeToggle from "./ThemeToggle";
import { Button, Dialog, Empty, Icon, Loading, Pagination } from "./ui";
import { getSupabase } from "@/lib/supabase";
import { roleLabel, webDashboardForRole } from "@/lib/roles";
import {
  cartTotal,
  friendlyError,
  lagosRange,
  minorUnits,
  parseProductsCsv,
  searchTerm,
  type CartLine,
  type Customer,
  type Product,
  type Profile,
  type Sale,
  type Summary,
} from "@/lib/domain";
import { operation, pendingIntent } from "@/lib/operations";
import { formatNaira } from "@/lib/format";
import "./workspace.css";

type Movement = {
  id: string;
  quantity_before: number;
  quantity_after: number;
  quantity_delta: number;
  reason: string;
  created_at: string;
};
type Tab =
  | "home"
  | "pos"
  | "inventory"
  | "sales"
  | "customers"
  | "alerts"
  | "profile";
const navItems: { id: Tab; label: string; icon: string }[] = [
  { id: "home", label: "Overview", icon: "home" },
  { id: "pos", label: "Make a sale", icon: "pos" },
  { id: "inventory", label: "Inventory", icon: "inventory" },
  { id: "sales", label: "Sales", icon: "sales" },
  { id: "customers", label: "Customers", icon: "customers" },
  { id: "alerts", label: "Attention", icon: "bell" },
  { id: "profile", label: "Account", icon: "profile" },
];
const money = (v: number | string) => formatNaira(Number(v));
const stamp = (v: string) =>
  new Date(v).toLocaleString("en-NG", {
    timeZone: "Africa/Lagos",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
const pageSize = 20;

export default function Workspace() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null),
    [business, setBusiness] = useState(""),
    [authError, setAuthError] = useState(""),
    [email, setEmail] = useState("");
  const [detailProduct, setDetailProduct] = useState<Product | null>(null),
    [movements, setMovements] = useState<Movement[]>([]),
    [movementError, setMovementError] = useState(""),
    [movementLoading, setMovementLoading] = useState(false),
    [historyCustomer, setHistoryCustomer] = useState<Customer | null>(null);
  const [tab, setTab] = useState<Tab>("home"),
    [period, setPeriod] = useState<"today" | "week" | "month">("month");
  const [summary, setSummary] = useState<Summary | null>(null),
    [products, setProducts] = useState<Product[]>([]),
    [sales, setSales] = useState<Sale[]>([]),
    [customers, setCustomers] = useState<Customer[]>([]),
    [alerts, setAlerts] = useState<Product[]>([]);
  const [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(0),
    [hasNext, setHasNext] = useState(false),
    [loading, setLoading] = useState(true),
    [refresh, setRefresh] = useState(0);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [offline, setOffline] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]),
    [customerName, setCustomerName] = useState(""),
    [customerId, setCustomerId] = useState<string | null>(null),
    [payment, setPayment] = useState("cash"),
    [note, setNote] = useState(""),
    [cashTendered, setCashTendered] = useState("");
  const [receipt, setReceipt] = useState<Sale | null>(null),
    [selected, setSelected] = useState<Product | null>(null),
    [form, setForm] = useState<
      "product" | "adjust" | "customer" | "import" | "cancel" | null
    >(null),
    [cancelId, setCancelId] = useState("");
  const [locked, setLocked] = useState(false),
    [unlockPassword, setUnlockPassword] = useState(""),
    [pending, setPending] = useState(false),
    [importRows, setImportRows] = useState<ReturnType<
      typeof parseProductsCsv
    > | null>(null);
  const submitRef = useRef(false),
    lastActive = useRef(0);
  const [authRevision, setAuthRevision] = useState(0);
  const reload = useCallback(() => setRefresh((n) => n + 1), []);
  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const sb = getSupabase();
        const { data } = await sb.auth.getSession();
        if (!data.session) {
          router.replace("/login");
          return;
        }
        const r = await sb
          .from("profiles")
          .select("id,tenant_id,full_name,role,is_active,branch")
          .eq("id", data.session.user.id)
          .single();
        if (ignore) return;
        if (r.error || !r.data) throw r.error ?? new Error("Profile missing");
        const p = r.data as Profile;
        if (!p.is_active) {
          await sb.auth.signOut();
          router.replace("/login");
          return;
        }
        if (!p.tenant_id || !["owner", "manager", "rep"].includes(p.role))
          throw { code: "42501" };
        const t = await sb
          .from("tenants")
          .select("name,business_name,status")
          .eq("id", p.tenant_id)
          .single();
        if (t.error) throw t.error;
        if (t.data.status === "suspended") throw { code: "42501" };
        if (ignore) return;
        setBusiness(t.data.business_name || t.data.name || "Your business");
        setEmail(data.session.user.email ?? "");
        setProfile(p);
        setPayment(p.role === "rep" ? "credit" : "cash");
        if (pendingIntent(p.id, "stockflow_v2_sale")) {
          setPending(true);
          setTab("pos");
        }
      } catch (e) {
        if (!ignore) setAuthError(friendlyError(e));
      }
    })();
    const {
      data: { subscription },
    } = getSupabase().auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") router.replace("/login");
    });
    return () => {
      ignore = true;
      subscription.unsubscribe();
    };
  }, [router, authRevision]);
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(searchTerm(search));
      setPage(0);
    }, 220);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    if (!profile || locked) return;
    const controller = new AbortController();
    let ignore = false;
    (async () => {
      await Promise.resolve();
      if (ignore) return;
      setLoading(true);
      setError("");
      try {
        const sb = getSupabase(),
          tenant = profile.tenant_id;
        if (tab === "home") {
          setSummary(null);
          const range = lagosRange(period);
          let recentQuery = sb
            .from("sales")
            .select(
              "id,customer_name,total_cases,total_value,status,created_at,payment_method",
            )
            .eq("tenant_id", tenant)
            .order("created_at", { ascending: false })
            .limit(5);
          if (profile.role === "rep")
            recentQuery = recentQuery.eq("rep_id", profile.id);
          const [stats, recent, low] = await Promise.all([
            sb
              .rpc("stockflow_v2_dashboard", {
                p_from: range.from,
                p_to: range.to,
              })
              .abortSignal(controller.signal),
            recentQuery.abortSignal(controller.signal),
            sb
              .from("products")
              .select(
                "id,name,sku_code,buy_price,sell_price,warehouse_stock,is_active",
              )
              .eq("tenant_id", tenant)
              .eq("is_active", true)
              .lt("warehouse_stock", 5)
              .order("name")
              .limit(5)
              .abortSignal(controller.signal),
          ]);
          if (stats.error) throw stats.error;
          if (recent.error) throw recent.error;
          if (low.error) throw low.error;
          if (!ignore) {
            setSummary(stats.data as Summary);
            setSales(recent.data as Sale[]);
            setAlerts(low.data as Product[]);
          }
        } else if (["inventory", "pos", "alerts"].includes(tab)) {
          let q = sb
            .from("products")
            .select(
              "id,name,sku_code,buy_price,sell_price,warehouse_stock,is_active,emoji",
            )
            .eq("tenant_id", tenant)
            .eq("is_active", true)
            .order("name")
            .order("id");
          if (query)
            q = q.or(`name.ilike.%${query}%,sku_code.ilike.%${query}%`);
          if (tab === "alerts") q = q.lt("warehouse_stock", 5);
          const res = await q
            .range(page * pageSize, page * pageSize + pageSize)
            .abortSignal(controller.signal);
          if (res.error) throw res.error;
          const list = res.data as Product[];
          if (profile.role === "rep" && list.length) {
            const h = await sb
              .from("rep_holdings")
              .select("product_id,quantity")
              .eq("tenant_id", tenant)
              .eq("rep_id", profile.id)
              .in(
                "product_id",
                list.map((p) => p.id),
              )
              .abortSignal(controller.signal);
            if (h.error) throw h.error;
            for (const p of list)
              p.available = Number(
                h.data.find((x) => x.product_id === p.id)?.quantity ?? 0,
              );
          }
          if (!ignore) {
            setProducts(list.slice(0, pageSize));
            setHasNext(list.length > pageSize);
          }
        } else if (tab === "sales") {
          let q = sb
            .from("sales")
            .select(
              "id,customer_name,total_cases,total_value,status,created_at,payment_method,stock_source,rep_id",
            )
            .eq("tenant_id", tenant)
            .order("created_at", { ascending: false })
            .order("id");
          if (profile.role === "rep") q = q.eq("rep_id", profile.id);
          if (historyCustomer) q = q.eq("customer_id", historyCustomer.id);
          if (query) q = q.ilike("customer_name", `%${query}%`);
          const res = await q
            .range(page * pageSize, page * pageSize + pageSize)
            .abortSignal(controller.signal);
          if (res.error) throw res.error;
          if (!ignore) {
            setSales(res.data as Sale[]);
            setHasNext(res.data.length > pageSize);
          }
        } else if (tab === "customers") {
          let q = sb
            .from("customers")
            .select("id,name,phone,address,credit_limit")
            .eq("tenant_id", tenant)
            .order("name")
            .order("id");
          if (query) q = q.ilike("name", `%${query}%`);
          const res = await q
            .range(page * pageSize, page * pageSize + pageSize)
            .abortSignal(controller.signal);
          if (res.error) throw res.error;
          if (!ignore) {
            setCustomers(res.data.slice(0, pageSize) as Customer[]);
            setHasNext(res.data.length > pageSize);
          }
        }
      } catch (e) {
        if (!ignore) setError(friendlyError(e));
      } finally {
        if (!ignore) setLoading(false);
      }
    })();
    return () => {
      ignore = true;
      controller.abort();
    };
  }, [profile, tab, query, page, period, refresh, locked, historyCustomer]);
  useEffect(() => {
    if (!profile) return;
    lastActive.current = Date.now();
    const sb = getSupabase();
    let timer: ReturnType<typeof setTimeout>;
    const channel = sb
      .channel(`v2:${profile.tenant_id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "sales",
          filter: `tenant_id=eq.${profile.tenant_id}`,
        },
        () => {
          clearTimeout(timer);
          timer = setTimeout(reload, 400);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "products",
          filter: `tenant_id=eq.${profile.tenant_id}`,
        },
        () => {
          clearTimeout(timer);
          timer = setTimeout(reload, 400);
        },
      )
      .subscribe();
    const focus = () => {
      if (Date.now() - lastActive.current > 300000) setLocked(true);
      else reload();
      lastActive.current = Date.now();
    };
    const activity = () => {
      lastActive.current = Date.now();
    };
    const connection = () => setOffline(!navigator.onLine);
    connection();
    const idle = setInterval(() => {
      if (Date.now() - lastActive.current > 300000) setLocked(true);
    }, 15000);
    window.addEventListener("focus", focus);
    window.addEventListener("pointerdown", activity);
    window.addEventListener("keydown", activity);
    window.addEventListener("online", connection);
    window.addEventListener("offline", connection);
    let appListener: { remove: () => Promise<void> } | undefined,
      disposed = false;
    import("@capacitor/app")
      .then(({ App }) =>
        App.addListener("appStateChange", ({ isActive }) => {
          if (!isActive) setLocked(true);
        }),
      )
      .then((handle) => {
        if (disposed) void handle.remove();
        else appListener = handle;
      })
      .catch(() => {});
    return () => {
      disposed = true;
      clearTimeout(timer);
      clearInterval(idle);
      void sb.removeChannel(channel);
      void appListener?.remove();
      window.removeEventListener("focus", focus);
      window.removeEventListener("pointerdown", activity);
      window.removeEventListener("keydown", activity);
      window.removeEventListener("online", connection);
      window.removeEventListener("offline", connection);
    };
  }, [profile, reload]);
  function navigate(next: Tab) {
    setTab(next);
    setSearch("");
    setQuery("");
    setPage(0);
    setError("");
    setNotice("");
    setHistoryCustomer(null);
  }
  function available(p: Product) {
    return profile?.role === "rep" ? (p.available ?? 0) : p.warehouse_stock;
  }
  function add(p: Product) {
    if (pending) {
      setError("Retry your unconfirmed checkout before changing the cart.");
      return;
    }
    const old = cart.find((x) => x.product.id === p.id),
      qty = (old?.quantity ?? 0) + 1;
    if (qty > available(p)) {
      setError("This product has no more available stock.");
      return;
    }
    setCart(
      old
        ? cart.map((x) => (x.product.id === p.id ? { ...x, quantity: qty } : x))
        : [...cart, { product: p, quantity: 1, price: String(p.sell_price) }],
    );
  }
  async function scan() {
    setError("");
    try {
      const {
        CapacitorBarcodeScanner,
        CapacitorBarcodeScannerTypeHintALLOption,
      } = await import("@capacitor/barcode-scanner");
      const result = await CapacitorBarcodeScanner.scanBarcode({
        hint: CapacitorBarcodeScannerTypeHintALLOption.ALL,
        scanInstructions: "Scan the product SKU barcode",
        web: { scannerFPS: 10 },
        cameraDirection: 1,
      });
      const code = result.ScanResult?.trim();
      if (!code) return;
      const r = await getSupabase()
        .from("products")
        .select(
          "id,name,sku_code,buy_price,sell_price,warehouse_stock,is_active",
        )
        .eq("tenant_id", profile!.tenant_id)
        .eq("sku_code", code)
        .eq("is_active", true)
        .maybeSingle();
      if (r.error) throw r.error;
      if (!r.data) {
        setError(
          "No product has this SKU. Search by name or check the product code.",
        );
        return;
      }
      const product = r.data as Product;
      if (profile!.role === "rep") {
        const h = await getSupabase()
          .from("rep_holdings")
          .select("quantity")
          .eq("tenant_id", profile!.tenant_id)
          .eq("rep_id", profile!.id)
          .eq("product_id", product.id)
          .maybeSingle();
        if (h.error) throw h.error;
        product.available = Number(h.data?.quantity ?? 0);
      }
      add(product);
    } catch {
      setError(
        "The camera could not scan this code. Allow camera access or enter the SKU in search.",
      );
    }
  }
  async function openProduct(p: Product) {
    setDetailProduct(p);
    setMovements([]);
    setMovementLoading(true);
    setMovementError("");
    try {
      let q = getSupabase()
        .from("stockflow_movements")
        .select(
          "id,quantity_before,quantity_after,quantity_delta,reason,created_at",
        )
        .eq("tenant_id", profile!.tenant_id)
        .eq("product_id", p.id)
        .order("created_at", { ascending: false })
        .order("id")
        .limit(20);
      q =
        profile!.role === "rep"
          ? q.eq("rep_id", profile!.id)
          : q.is("rep_id", null);
      const result = await q;
      if (result.error) throw result.error;
      setMovements(result.data as Movement[]);
    } catch (e) {
      setMovementError(friendlyError(e));
    } finally {
      setMovementLoading(false);
    }
  }
  async function openReceipt(id: string) {
    try {
      const r = await getSupabase()
        .from("sales")
        .select(
          "id,customer_name,total_cases,total_value,status,created_at,payment_method,stock_source,rep_id,sale_items(product_id,quantity,unit_price,products(name))",
        )
        .eq("tenant_id", profile!.tenant_id)
        .eq("id", id)
        .single();
      if (r.error) throw r.error;
      setReceipt(r.data as unknown as Sale);
    } catch (e) {
      setError(friendlyError(e));
    }
  }
  async function checkout() {
    if (submitRef.current || !profile) return;
    setError("");
    setNotice("");
    let params: Record<string, unknown>;
    const old = pendingIntent(profile.id, "stockflow_v2_sale");
    if (old) params = old;
    else {
      if (!cart.length) {
        setError("Add at least one product to your sale.");
        return;
      }
      try {
        const t = cartTotal(cart);
        if (
          payment === "cash" &&
          cashTendered &&
          minorUnits(cashTendered) < Math.round(t * 100)
        ) {
          setError("Cash received is below the sale total.");
          return;
        }
      } catch (e) {
        setError((e as Error).message);
        return;
      }
      params = {
        p_customer_name: customerName.trim() || "Walk-in customer",
        p_customer_id: customerId,
        p_items: cart.map((x) => ({
          product_id: x.product.id,
          quantity: x.quantity,
          unit_price: minorUnits(x.price) / 100,
        })),
        p_payment_method: payment,
        p_notes: note.trim() || null,
      };
    }
    submitRef.current = true;
    setBusy(true);
    try {
      const id = await operation<string>(
        profile.id,
        "stockflow_v2_sale",
        params,
      );
      setPending(false);
      setCart([]);
      setCustomerName("");
      setCustomerId(null);
      setCashTendered("");
      setNote("");
      setNotice(
        profile.role === "rep"
          ? "Sale recorded; manager review is pending."
          : "Sale recorded. Stock and sales are updated.",
      );
      reload();
      await openReceipt(id);
    } catch (e) {
      setPending(!!pendingIntent(profile.id, "stockflow_v2_sale"));
      setError(friendlyError(e));
    } finally {
      setBusy(false);
      submitRef.current = false;
    }
  }
  async function saveForm(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || !profile) return;
    setBusy(true);
    setError("");
    const values = new FormData(e.currentTarget);
    try {
      if (form === "product") {
        const data: Record<string, unknown> = {
          name: String(values.get("name")).trim(),
          buy_price: minorUnits(String(values.get("buy_price"))) / 100,
          sell_price: minorUnits(String(values.get("sell_price"))) / 100,
          sku_code: String(values.get("sku_code") ?? "").trim() || null,
        };
        if (!selected)
          data.opening_stock = Number(values.get("opening_stock") || 0);
        else
          data.reason = String(
            values.get("reason") || "Product metadata updated",
          );
        await operation(profile.id, "stockflow_v2_product", {
          p_product_id: selected?.id ?? null,
          p_data: data,
        });
      } else if (form === "adjust" && selected) {
        const count = Number(values.get("stock"));
        if (!Number.isInteger(count) || count < 0)
          throw new Error("Quantity must be a positive whole number.");
        await operation(profile.id, "stockflow_v2_adjust_stock", {
          p_product_id: selected.id,
          p_delta: count - selected.warehouse_stock,
          p_expected: selected.warehouse_stock,
          p_reason: String(values.get("reason")).trim(),
        });
      } else if (form === "customer") {
        await operation(profile.id, "stockflow_v2_customer", {
          p_name: String(values.get("name")).trim(),
          p_phone: String(values.get("phone")).trim() || null,
          p_address: String(values.get("address")).trim() || null,
        });
      } else if (form === "cancel") {
        const r = await getSupabase().rpc("stockflow_v2_cancel_sale", {
          p_sale_id: cancelId,
          p_reason: String(values.get("reason")).trim(),
        });
        if (r.error) throw r.error;
      } else if (form === "import" && importRows) {
        await operation(profile.id, "stockflow_v2_import_products", {
          p_rows: importRows,
        });
      }
      setForm(null);
      setSelected(null);
      setNotice("Saved. Your business records are up to date.");
      reload();
    } catch (e) {
      setError(
        e instanceof Error && /price|Quantity|CSV/.test(e.message)
          ? e.message
          : friendlyError(e),
      );
    } finally {
      setBusy(false);
    }
  }
  async function unlock(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await getSupabase().auth.signInWithPassword({
        email,
        password: unlockPassword,
      });
      if (r.error) throw r.error;
      setUnlockPassword("");
      lastActive.current = Date.now();
      // Recheck the authoritative profile without reloading the native webview:
      // a reload would discard its intentionally memory-only auth session.
      setAuthError("");
      setProfile(null);
      setCart([]);
      setCustomerId(null);
      setCustomerName("");
      setReceipt(null);
      setProducts([]);
      setSales([]);
      setCustomers([]);
      setSummary(null);
      setLocked(false);
      setAuthRevision((n) => n + 1);
    } catch {
      setError("Could not unlock. Check your password and connection.");
    } finally {
      setBusy(false);
    }
  }
  async function signOut() {
    setProfile(null);
    setCart([]);
    await getSupabase().auth.signOut({ scope: "local" });
    router.replace("/login");
  }
  async function shareReceipt() {
    if (!receipt) return;
    const text = `${business}\nReceipt ${receipt.id}\n${stamp(receipt.created_at)}\n${receipt.customer_name}\n${(receipt.sale_items ?? []).map((i) => `${i.products?.name ?? "Product"} ×${i.quantity} · ${money(i.quantity * Number(i.unit_price))}`).join("\n")}\nTotal: ${money(receipt.total_value)}\nStatus: ${receipt.status}`;
    try {
      if (navigator.share)
        await navigator.share({ title: "StockFlow receipt", text });
      else {
        await navigator.clipboard.writeText(text);
        setNotice("Receipt copied. Paste it into WhatsApp or your message.");
      }
    } catch {
      setError("Receipt could not be shared. Try again or use Print.");
    }
  }
  if (authError)
    return (
      <main className="sf-auth-error">
        <h1>We could not open your business</h1>
        <p role="alert">{authError}</p>
        <Button onClick={() => { setAuthError(""); setAuthRevision((n) => n + 1); }}>Try again</Button>
        <a href={webDashboardForRole("owner")}>Open existing web dashboard</a>
        <Button variant="ghost" onClick={signOut}>
          Sign out
        </Button>
      </main>
    );
  if (!profile) return <Loading />;
  if (locked)
    return (
      <main className="sf-auth-error">
        <div className="sf-brand-mark">S</div>
        <h1>Welcome back, {profile.full_name.split(" ")[0]}</h1>
        <p>Unlock StockFlow to continue managing {business}.</p>
        <form onSubmit={unlock}>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={unlockPassword}
              onChange={(e) => setUnlockPassword(e.target.value)}
              required
            />
          </label>
          {error && <p role="alert">{error}</p>}
          <Button type="submit" disabled={busy}>
            Unlock
          </Button>
        </form>
        <Button variant="ghost" onClick={signOut}>
          Sign out
        </Button>
      </main>
    );
  let total = 0;
  try {
    total = cartTotal(cart);
  } catch {
    /* checked at checkout */
  }
  const title = navItems.find((n) => n.id === tab)!.label;
  const productEmpty = (
    <Empty
      title="Start with your first product"
      description="Add a product and opening stock. Then make your first sale to see your business take shape."
      action={
        profile.role === "owner" ? (
          <Button
            onClick={() => {
              setSelected(null);
              setForm("product");
            }}
          >
            Add product
          </Button>
        ) : undefined
      }
    />
  );
  return (
    <div className="sf-workspace">
      <aside className="sf-sidebar">
        <Link className="sf-wordmark" href="/home">
          <span className="sf-brand-mark">S</span>Stock<span>Flow</span>
          <small>V2</small>
        </Link>
        <div className="sf-business">
          <span className="sf-business-avatar">{business.charAt(0)}</span>
          <div>
            <strong>{business}</strong>
            <small>
              {roleLabel(profile.role)} ·{" "}
              {profile.role === "rep" ? "Rep holdings" : "Warehouse"}
            </small>
          </div>
        </div>
        <nav aria-label="Business navigation">
          {navItems.map((n) => (
            <button
              key={n.id}
              className={tab === n.id ? "active" : ""}
              onClick={() => navigate(n.id)}
              aria-current={tab === n.id ? "page" : undefined}
            >
              <Icon name={n.icon} />
              {n.label}
            </button>
          ))}
        </nav>
        <div className="sf-sidebar-foot">
          <span className="sf-avatar">{profile.full_name.charAt(0)}</span>
          <div>
            <strong>{profile.full_name}</strong>
            <small>{roleLabel(profile.role)}</small>
          </div>
        </div>
      </aside>
      <div className="sf-main">
        <header className="sf-topbar">
          <div>
            <strong>{title}</strong>
            <span>
              {business} · {profile.branch ? `${profile.branch} · ` : ""}
              {profile.role === "rep" ? "Your holdings" : "Central warehouse"}
            </span>
          </div>
          <div className="sf-topbar-actions">
            <span className="sf-live">
              <i />
              Shared business data
            </span>
            <Button
              variant="ghost"
              aria-label="Refresh data"
              onClick={reload}
              disabled={loading}
            >
              <Icon name="refresh" />
            </Button>
            <ThemeToggle />
            <Button
              variant="ghost"
              aria-label="Attention"
              onClick={() => navigate("alerts")}
            >
              <Icon name="bell" />
            </Button>
          </div>
        </header>
        <main
          className={`sf-content ${tab === "pos" ? "sf-content--pos" : ""}`}
        >
          {offline && (
            <div className="sf-error" role="status">
              You are offline. Keep your cart open; reconnect before confirming
              a sale.
            </div>
          )}
          {error && (
            <div className="sf-error" role="alert">
              {error}
              <Button
                variant="ghost"
                onClick={() => setError("")}
                aria-label="Dismiss error"
              >
                <Icon name="close" />
              </Button>
            </div>
          )}
          {notice && (
            <div className="sf-notice" role="status">
              <Icon name="check" />
              {notice}
            </div>
          )}
          {tab === "home" && (
            <>
              <div className="sf-page-heading">
                <div>
                  <span className="sf-eyebrow">YOUR BUSINESS, AT A GLANCE</span>
                  <h1>Good to see you, {profile.full_name.split(" ")[0]}.</h1>
                  <p>
                    A clear view of your sales, stock and what needs attention.
                  </p>
                </div>
                <Button onClick={() => navigate("pos")}>
                  <Icon name="plus" />
                  Make a sale
                </Button>
              </div>
              <div className="sf-period" aria-label="Reporting period">
                {(["today", "week", "month"] as const).map((p) => (
                  <button
                    key={p}
                    className={period === p ? "active" : ""}
                    onClick={() => setPeriod(p)}
                  >
                    {p === "today"
                      ? "Today"
                      : p === "week"
                        ? "7 days"
                        : "30 days"}
                  </button>
                ))}
                <span>Reporting timezone: Lagos</span>
              </div>
              {loading ? (
                <Loading />
              ) : (
                summary && (
                  <>
                    <div className="sf-metrics">
                      <Metric
                        label="Completed sales"
                        value={money(summary.revenue)}
                        icon="trend"
                        featured
                      />
                      <Metric
                        label="Estimated gross profit"
                        value={
                          summary.gross_profit === null
                            ? "Cost data missing"
                            : money(summary.gross_profit)
                        }
                        icon="inventory"
                      />
                      <Metric
                        label="Transactions"
                        value={summary.transactions.toLocaleString()}
                        icon="sales"
                      />
                      <Metric
                        label="Cases sold"
                        value={summary.units.toLocaleString()}
                        icon="pos"
                      />
                    </div>
                    <div className="sf-dashboard-grid">
                      <section className="sf-card sf-trend">
                        <div className="sf-card-heading">
                          <div>
                            <h2>Sales over time</h2>
                            <p>Completed, approved and confirmed sales</p>
                          </div>
                          <span className="sf-badge">
                            {period === "today"
                              ? "Today"
                              : period === "week"
                                ? "Past 7 days"
                                : "Past 30 days"}
                          </span>
                        </div>
                        <SalesChart points={summary.trend} />
                        <div className="sf-chart-caption">
                          <span>
                            <i />
                            Sales revenue
                          </span>
                          <strong>{money(summary.revenue)}</strong>
                        </div>
                      </section>
                      <section className="sf-card">
                        <div className="sf-card-heading">
                          <div>
                            <h2>Needs your attention</h2>
                            <p>Keep your next sale moving.</p>
                          </div>
                          <Icon name="bell" />
                        </div>
                        {alerts.length ? (
                          alerts.map((p) => (
                            <button
                              className="sf-attention-row"
                              key={p.id}
                              onClick={() => navigate("inventory")}
                            >
                              <span className="sf-product-icon">
                                <Icon name="inventory" />
                              </span>
                              <span>
                                <strong>{p.name}</strong>
                                <small>
                                  {p.warehouse_stock === 0
                                    ? "Out of stock"
                                    : `${p.warehouse_stock} warehouse cases`}
                                </small>
                              </span>
                              <span className="sf-badge sf-badge--warn">
                                {p.warehouse_stock === 0 ? "Empty" : "Low"}
                              </span>
                            </button>
                          ))
                        ) : (
                          <p className="sf-muted">
                            No low warehouse stock found in this check.
                          </p>
                        )}
                        <div className="sf-pending">
                          <strong>{money(summary.pending_sales)}</strong>
                          <span>
                            Sales awaiting review · separate from completed
                            sales
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          onClick={() => navigate("alerts")}
                        >
                          View attention centre
                          <Icon name="arrow" />
                        </Button>
                      </section>
                      <section className="sf-card">
                        <div className="sf-card-heading">
                          <div>
                            <h2>Recent sales</h2>
                            <p>Your latest business activity.</p>
                          </div>
                          <Button
                            variant="ghost"
                            onClick={() => navigate("sales")}
                          >
                            View all
                            <Icon name="arrow" />
                          </Button>
                        </div>
                        {sales.length ? (
                          sales
                            .slice(0, 5)
                            .map((s) => (
                              <SaleRow
                                key={s.id}
                                sale={s}
                                onClick={() => openReceipt(s.id)}
                              />
                            ))
                        ) : (
                          <Empty
                            title="Your first sale starts here"
                            description="Add a product, then record a sale."
                            action={
                              <Button onClick={() => navigate("pos")}>
                                Open sales desk
                              </Button>
                            }
                          />
                        )}
                      </section>
                      <section className="sf-card">
                        <div className="sf-card-heading">
                          <div>
                            <h2>Top products</h2>
                            <p>Ranked by cases sold this period.</p>
                          </div>
                          <Icon name="inventory" />
                        </div>
                        {summary.top_products.length ? (
                          summary.top_products.map((p, i) => (
                            <div className="sf-ranking" key={p.name + i}>
                              <span>{String(i + 1).padStart(2, "0")}</span>
                              <div>
                                <strong>{p.name}</strong>
                                <small>{p.units} cases sold</small>
                              </div>
                              <strong>{money(p.revenue)}</strong>
                            </div>
                          ))
                        ) : (
                          <p className="sf-muted">
                            Complete a sale to see your best sellers.
                          </p>
                        )}
                      </section>
                    </div>
                  </>
                )
              )}
            </>
          )}
          {tab === "pos" && (
            <div className="sf-pos-layout">
              <section>
                <div className="sf-page-heading">
                  <div>
                    <span className="sf-eyebrow">SALES DESK</span>
                    <h1>Find it. Add it. Sell it.</h1>
                    <p>
                      {profile.role === "rep"
                        ? "Sell from your allocated holdings."
                        : "Sell from the warehouse with a clear stock check."}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    onClick={scan}
                    disabled={busy || pending}
                  >
                    <Icon name="scan" />
                    Scan SKU
                  </Button>
                </div>
                <Search
                  value={search}
                  onChange={setSearch}
                  placeholder="Search products or SKU"
                />
                {loading ? (
                  <Loading />
                ) : !products.length ? (
                  productEmpty
                ) : (
                  <div className="sf-product-grid">
                    {products.map((p) => (
                      <button
                        className="sf-product-tile"
                        key={p.id}
                        onClick={() => add(p)}
                        disabled={available(p) === 0 || pending}
                      >
                        <span className="sf-product-art">
                          <Icon name="inventory" size={36} />
                          <span
                            className={`sf-stock-pill ${available(p) < 5 ? "low" : ""}`}
                          >
                            {available(p)} available
                          </span>
                        </span>
                        <strong>{p.name}</strong>
                        <small>{p.sku_code || "No SKU"}</small>
                        <span className="sf-product-price">
                          {money(p.sell_price)}
                          <span>
                            <Icon name="plus" />
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                <Pagination
                  page={page}
                  hasNext={hasNext}
                  busy={loading}
                  onChange={setPage}
                />
              </section>
              <aside className="sf-cart" id="sf-cart">
                <div className="sf-cart-heading">
                  <h2>Current sale</h2>
                  <span className="sf-badge">
                    {cart.reduce((a, x) => a + x.quantity, 0)} cases
                  </span>
                </div>
                {pending && (
                  <div className="sf-error">
                    An earlier checkout is unconfirmed. Retry to retrieve its
                    final result using your original request.
                  </div>
                )}
                {!cart.length && !pending ? (
                  <Empty
                    title="Ready for your next sale"
                    description="Tap a product or scan its SKU to add it here."
                  />
                ) : (
                  <div className="sf-cart-lines">
                    {cart.map((line) => (
                      <div className="sf-cart-line" key={line.product.id}>
                        <div>
                          <strong>{line.product.name}</strong>
                          <small>
                            {money(line.product.sell_price)} list price
                          </small>
                        </div>
                        <Button
                          variant="ghost"
                          aria-label={`Remove ${line.product.name}`}
                          disabled={pending}
                          onClick={() =>
                            setCart(
                              cart.filter(
                                (x) => x.product.id !== line.product.id,
                              ),
                            )
                          }
                        >
                          <Icon name="close" size={16} />
                        </Button>
                        <div className="sf-quantity">
                          <button
                            aria-label={`Decrease ${line.product.name}`}
                            disabled={pending || line.quantity === 1}
                            onClick={() =>
                              setCart(
                                cart.map((x) =>
                                  x.product.id === line.product.id
                                    ? { ...x, quantity: x.quantity - 1 }
                                    : x,
                                ),
                              )
                            }
                          >
                            −
                          </button>
                          <input
                            aria-label={`Quantity for ${line.product.name}`}
                            type="number"
                            min="1"
                            max={available(line.product)}
                            value={line.quantity}
                            disabled={pending}
                            onChange={(e) => {
                              const n = Number(e.target.value);
                              if (
                                Number.isInteger(n) &&
                                n > 0 &&
                                n <= available(line.product)
                              )
                                setCart(
                                  cart.map((x) =>
                                    x.product.id === line.product.id
                                      ? { ...x, quantity: n }
                                      : x,
                                  ),
                                );
                            }}
                          />
                          <button
                            aria-label={`Increase ${line.product.name}`}
                            disabled={
                              pending ||
                              line.quantity >= available(line.product)
                            }
                            onClick={() => add(line.product)}
                          >
                            +
                          </button>
                        </div>
                        <label className="sf-line-price">
                          Unit price
                          <input
                            inputMode="decimal"
                            value={line.price}
                            disabled={pending}
                            onChange={(e) =>
                              setCart(
                                cart.map((x) =>
                                  x.product.id === line.product.id
                                    ? { ...x, price: e.target.value }
                                    : x,
                                ),
                              )
                            }
                          />
                        </label>
                      </div>
                    ))}
                  </div>
                )}
                <label>
                  Customer
                  <input
                    placeholder="Walk-in customer"
                    value={customerName}
                    disabled={pending}
                    onChange={(e) => {
                      setCustomerName(e.target.value);
                      setCustomerId(null);
                    }}
                  />
                </label>
                <label>
                  Payment method
                  <select
                    value={payment}
                    onChange={(e) => setPayment(e.target.value)}
                    disabled={pending || profile.role === "rep"}
                  >
                    {profile.role === "rep" ? (
                      <option value="credit">
                        Rep credit sale · review required
                      </option>
                    ) : (
                      <>
                        <option value="cash">Cash</option>
                        <option value="transfer">Bank transfer recorded</option>
                        <option value="pos">Card / POS recorded</option>
                      </>
                    )}
                  </select>
                </label>
                <details className="sf-advanced">
                  <summary>Additional details</summary>
                  <label>
                    Sale note
                    <input
                      value={note}
                      disabled={pending}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="e.g. Agreed wholesale price"
                    />
                  </label>
                  {payment === "cash" && (
                    <label>
                      Cash received
                      <input
                        inputMode="decimal"
                        value={cashTendered}
                        onChange={(e) => setCashTendered(e.target.value)}
                        placeholder="Optional, for change calculation"
                      />
                    </label>
                  )}
                  {cashTendered && (
                    <p>
                      Change: {money(Math.max(0, Number(cashTendered) - total))}
                    </p>
                  )}
                </details>
                <div className="sf-cart-total">
                  <span>Total</span>
                  <strong>
                    {pending ? "Retry original sale" : money(total)}
                  </strong>
                </div>
                <Button
                  disabled={busy || offline || (!cart.length && !pending)}
                  onClick={checkout}
                >
                  {busy
                    ? "Confirming sale…"
                    : pending
                      ? "Retry unconfirmed checkout"
                      : "Complete sale"}
                  <Icon name="arrow" />
                </Button>
                <p className="sf-cart-note">
                  {profile.role === "rep"
                    ? "Payments are recorded and confirmed separately by your manager."
                    : "Payment entries record your chosen method. Verify receipt of funds before completing a sale."}
                </p>
              </aside>
            </div>
          )}
          {(tab === "inventory" || tab === "alerts") && (
            <>
              <Heading
                eyebrow={tab === "alerts" ? "STOCK ALERTS" : "STOCK CONTROL"}
                title={
                  tab === "alerts"
                    ? "Keep your shelves ready."
                    : "Every case, accounted for."
                }
                description={
                  tab === "alerts"
                    ? "Products with fewer than five warehouse cases."
                    : "Check availability and make traceable stock adjustments."
                }
                action={
                  profile.role === "owner" ? (
                    <div className="sf-actions">
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setImportRows(null);
                          setForm("import");
                        }}
                      >
                        Import CSV
                      </Button>
                      <Button
                        onClick={() => {
                          setSelected(null);
                          setForm("product");
                        }}
                      >
                        <Icon name="plus" />
                        Add product
                      </Button>
                    </div>
                  ) : undefined
                }
              />
              <Search
                value={search}
                onChange={setSearch}
                placeholder="Search products or SKU"
              />
              {loading ? (
                <Loading />
              ) : !products.length ? (
                tab === "alerts" ? (
                  <Empty
                    title="All clear"
                    description="No products matched the low-stock filter."
                  />
                ) : (
                  productEmpty
                )
              ) : (
                <div className="sf-card sf-table-wrap">
                  <table className="sf-table">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>SKU</th>
                        <th>Available cases</th>
                        <th>Price</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.map((p) => (
                        <tr key={p.id}>
                          <td>
                            <button
                              className="sf-product-name"
                              onClick={() => openProduct(p)}
                            >
                              {p.name}
                            </button>
                            <small>{money(p.buy_price)} cost</small>
                          </td>
                          <td>{p.sku_code || "—"}</td>
                          <td>
                            <span
                              className={`sf-badge ${available(p) < 5 ? "sf-badge--warn" : ""}`}
                            >
                              {available(p)}
                            </span>
                          </td>
                          <td>{money(p.sell_price)}</td>
                          <td>
                            <div className="sf-actions">
                              {profile.role === "owner" && (
                                <Button
                                  variant="ghost"
                                  onClick={() => {
                                    setSelected(p);
                                    setForm("product");
                                  }}
                                >
                                  Edit
                                </Button>
                              )}
                              {profile.role !== "rep" && (
                                <Button
                                  variant="ghost"
                                  onClick={() => {
                                    setSelected(p);
                                    setForm("adjust");
                                  }}
                                >
                                  Adjust
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                onClick={() => {
                                  navigate("pos");
                                  add(p);
                                }}
                              >
                                Sell
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <Pagination
                page={page}
                hasNext={hasNext}
                busy={loading}
                onChange={setPage}
              />
            </>
          )}
          {tab === "sales" && (
            <>
              <Heading
                eyebrow="TRANSACTION HISTORY"
                title="A record of every sale."
                description="Open a sale to view its receipt and authoritative total."
                action={
                  <Button onClick={() => navigate("pos")}>
                    <Icon name="plus" />
                    New sale
                  </Button>
                }
              />
              {historyCustomer && (
                <div className="sf-notice">
                  Sales linked to {historyCustomer.name}
                  <Button
                    variant="ghost"
                    onClick={() => setHistoryCustomer(null)}
                  >
                    Clear filter
                  </Button>
                </div>
              )}
              <Search
                value={search}
                onChange={setSearch}
                placeholder="Search by customer"
              />
              {loading ? (
                <Loading />
              ) : (
                <section className="sf-card">
                  {sales.length ? (
                    sales.slice(0, pageSize).map((s) => (
                      <div className="sf-sale-actions" key={s.id}>
                        <SaleRow sale={s} onClick={() => openReceipt(s.id)} />
                        {s.status !== "cancelled" &&
                          s.stock_source &&
                          (profile.role !== "rep" ||
                            ["pending", "edited"].includes(s.status)) && (
                            <Button
                              variant="ghost"
                              onClick={() => {
                                setCancelId(s.id);
                                setForm("cancel");
                              }}
                            >
                              Cancel
                            </Button>
                          )}
                      </div>
                    ))
                  ) : (
                    <Empty
                      title="No sales yet"
                      description="Complete your first sale to see it here."
                      action={
                        <Button onClick={() => navigate("pos")}>
                          Make a sale
                        </Button>
                      }
                    />
                  )}
                </section>
              )}
              <Pagination
                page={page}
                hasNext={hasNext}
                busy={loading}
                onChange={setPage}
              />
            </>
          )}
          {tab === "customers" && (
            <>
              <Heading
                eyebrow="YOUR CUSTOMERS"
                title="Know who buys from you."
                description="Find customer details and start their next sale."
                action={
                  <Button onClick={() => setForm("customer")}>
                    <Icon name="plus" />
                    Add customer
                  </Button>
                }
              />
              <Search
                value={search}
                onChange={setSearch}
                placeholder="Search customers"
              />
              {loading ? (
                <Loading />
              ) : customers.length ? (
                <div className="sf-customer-grid">
                  {customers.map((c) => (
                    <article className="sf-card sf-customer" key={c.id}>
                      <span className="sf-avatar">{c.name.charAt(0)}</span>
                      <h2>{c.name}</h2>
                      <p>
                        {c.phone || "No phone number"}
                        <br />
                        {c.address || "No address recorded"}
                      </p>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          navigate("sales");
                          setHistoryCustomer(c);
                        }}
                      >
                        Purchase history
                        <Icon name="arrow" />
                      </Button>
                      <Button
                        onClick={() => {
                          navigate("pos");
                          setCustomerName(c.name);
                          setCustomerId(c.id);
                        }}
                      >
                        Make a sale
                      </Button>
                    </article>
                  ))}
                </div>
              ) : (
                <Empty
                  title="Add your first customer"
                  description="Keep customer details in one place and attach them to sales."
                  action={
                    <Button onClick={() => setForm("customer")}>
                      Add customer
                    </Button>
                  }
                />
              )}
              <Pagination
                page={page}
                hasNext={hasNext}
                busy={loading}
                onChange={setPage}
              />
            </>
          )}
          {tab === "profile" && (
            <>
              <Heading
                eyebrow="YOUR WORKSPACE"
                title={business}
                description={`${profile.full_name} · ${roleLabel(profile.role)}`}
              />
              <section className="sf-card sf-account">
                <h2>Business and account</h2>
                <dl>
                  <dt>Business</dt>
                  <dd>{business}</dd>
                  <dt>Stock context</dt>
                  <dd>
                    {profile.role === "rep"
                      ? "Your allocated holdings"
                      : "Central warehouse"}
                  </dd>
                  <dt>Role</dt>
                  <dd>{roleLabel(profile.role)}</dd>
                  <dt>Email</dt>
                  <dd>{email}</dd>
                </dl>
                <Button variant="ghost" onClick={() => setLocked(true)}>
                  Lock workspace
                </Button>
                <a
                  className="sf-button sf-button--ghost"
                  href={webDashboardForRole(profile.role)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open advanced operations
                </a>
                <p className="sf-muted">
                  Supplier orders, staff, rep approvals, expenses and
                  administration remain in your existing role dashboard. A
                  separate browser may require sign-in.
                </p>
                <Button variant="danger" onClick={signOut}>
                  Sign out on this device
                </Button>
              </section>
            </>
          )}
        </main>
        {tab === "pos" && cart.length > 0 && (
          <button
            className="sf-mobile-cart"
            onClick={() =>
              document
                .getElementById("sf-cart")
                ?.scrollIntoView({ behavior: "smooth" })
            }
          >
            <Icon name="pos" />
            <span>
              {cart.reduce((a, x) => a + x.quantity, 0)} cases · {money(total)}
            </span>
            <strong>View cart ↓</strong>
          </button>
        )}
        <nav className="sf-bottom-nav" aria-label="Mobile navigation">
          {[
            navItems[0],
            navItems[2],
            navItems[1],
            navItems[3],
            navItems[4],
            navItems[6],
          ].map((n) => (
            <button
              key={n.id}
              className={tab === n.id ? "active" : ""}
              onClick={() => navigate(n.id)}
              aria-current={tab === n.id ? "page" : undefined}
            >
              <Icon name={n.icon} />
              <span>{n.id === "pos" ? "Sell" : n.label}</span>
            </button>
          ))}
        </nav>
      </div>
      {detailProduct && (
        <Dialog
          title={detailProduct.name}
          onClose={() => setDetailProduct(null)}
        >
          <div className="sf-product-detail">
            <p className="sf-muted">
              {detailProduct.sku_code || "No SKU"} ·{" "}
              {profile.role === "rep"
                ? "Your allocated holdings"
                : "Central warehouse"}
            </p>
            <div className="sf-detail-metrics">
              <div>
                <span>Available cases</span>
                <strong>{available(detailProduct)}</strong>
              </div>
              <div>
                <span>Selling price</span>
                <strong>{money(detailProduct.sell_price)}</strong>
              </div>
            </div>
            <h3>Recent stock movements</h3>
            <p className="sf-muted">
              Last 20 entries. V2 begins with a reconciled opening balance;
              earlier movement history is not reconstructed.
            </p>
            {movementLoading ? (
              <Loading />
            ) : movementError ? (
              <p className="sf-error" role="alert">
                {movementError}
              </p>
            ) : movements.length ? (
              movements.map((m) => (
                <article className="sf-movement" key={m.id}>
                  <div>
                    <strong>
                      {m.quantity_delta > 0 ? "+" : ""}
                      {m.quantity_delta} cases
                    </strong>
                    <small>
                      {stamp(m.created_at)} · {m.quantity_before} →{" "}
                      {m.quantity_after}
                    </small>
                  </div>
                  <p>{m.reason}</p>
                </article>
              ))
            ) : (
              <p className="sf-muted">
                No movements are available for this stock context.
              </p>
            )}
          </div>
        </Dialog>
      )}
      {receipt && (
        <Dialog title="Sale receipt" onClose={() => setReceipt(null)}>
          <div className="sf-receipt">
            <div className="sf-brand-mark">S</div>
            <h3>{business}</h3>
            <span className="sf-badge">{receipt.status}</span>
            <p>
              {stamp(receipt.created_at)}
              <br />
              Customer: {receipt.customer_name}
              <br />
              <small>Receipt {receipt.id}</small>
            </p>
            {(receipt.sale_items ?? []).map((i, index) => (
              <div className="sf-receipt-line" key={index}>
                <span>
                  {i.products?.name ?? "Product"} ×{i.quantity}
                </span>
                <strong>{money(Number(i.unit_price) * i.quantity)}</strong>
              </div>
            ))}
            <div className="sf-cart-total">
              <span>Total</span>
              <strong>{money(receipt.total_value)}</strong>
            </div>
            <p>
              {receipt.payment_method
                ? "Payment recorded: " + receipt.payment_method
                : "Rep sale · payment confirmed separately"}
            </p>
            {receipt.status === "cancelled" && (
              <p>
                This sale is cancelled. A bank or card refund is not performed
                by this action.
              </p>
            )}
          </div>
          <div className="sf-actions">
            <Button onClick={shareReceipt}>Share receipt</Button>
            <Button variant="ghost" onClick={() => window.print()}>
              Print
            </Button>
          </div>
        </Dialog>
      )}
      {form && (
        <Dialog
          title={
            form === "product"
              ? selected
                ? "Edit product"
                : "Add product"
              : form === "adjust"
                ? "Adjust stock"
                : form === "customer"
                  ? "Add customer"
                  : form === "cancel"
                    ? "Cancel sale"
                    : "Import products"
          }
          onClose={() => {
            if (!busy) setForm(null);
          }}
        >
          <form onSubmit={saveForm} className="sf-form">
            {error && (
              <p className="sf-error" role="alert">
                {error}
              </p>
            )}
            {form === "product" && (
              <>
                <label>
                  Product name
                  <input
                    name="name"
                    required
                    maxLength={200}
                    defaultValue={selected?.name}
                    placeholder="e.g. Flour 50kg"
                  />
                </label>
                <div className="sf-form-row">
                  <label>
                    Cost per case (₦)
                    <input
                      name="buy_price"
                      inputMode="decimal"
                      required
                      defaultValue={selected?.buy_price}
                      placeholder="0.00"
                    />
                  </label>
                  <label>
                    Selling price (₦)
                    <input
                      name="sell_price"
                      inputMode="decimal"
                      required
                      defaultValue={selected?.sell_price}
                      placeholder="0.00"
                    />
                  </label>
                </div>
                {!selected && (
                  <label>
                    Opening stock (cases)
                    <input
                      name="opening_stock"
                      type="number"
                      min="0"
                      max="1000000"
                      step="1"
                      defaultValue="0"
                    />
                  </label>
                )}
                <details>
                  <summary>Additional details</summary>
                  <label>
                    SKU / barcode value
                    <input
                      name="sku_code"
                      maxLength={80}
                      defaultValue={selected?.sku_code ?? ""}
                      placeholder="Optional unique code"
                    />
                  </label>
                  {selected && (
                    <label>
                      Reason for changes
                      <input
                        name="reason"
                        required
                        defaultValue="Product metadata updated"
                      />
                    </label>
                  )}
                </details>
                <p className="sf-muted">
                  Stock adjustments are recorded separately from product edits.
                </p>
              </>
            )}
            {form === "adjust" && selected && (
              <>
                <p>
                  <strong>{selected.name}</strong> · current warehouse stock:{" "}
                  {selected.warehouse_stock}
                </p>
                <label>
                  New count
                  <input
                    name="stock"
                    type="number"
                    min="0"
                    step="1"
                    defaultValue={selected.warehouse_stock}
                    required
                  />
                </label>
                <label>
                  Reason
                  <input
                    name="reason"
                    required
                    minLength={3}
                    placeholder="e.g. Physical count correction"
                  />
                </label>
              </>
            )}
            {form === "customer" && (
              <>
                <label>
                  Customer name
                  <input name="name" required maxLength={200} />
                </label>
                <label>
                  Phone
                  <input name="phone" type="tel" maxLength={30} />
                </label>
                <label>
                  Address
                  <input name="address" maxLength={500} />
                </label>
              </>
            )}
            {form === "cancel" && (
              <>
                <p>
                  Stock will be restored once and the cancellation recorded.
                  This does not send money back to a bank or card.
                </p>
                <label>
                  Reason
                  <input name="reason" minLength={3} required />
                </label>
              </>
            )}
            {form === "import" && (
              <>
                <p>
                  CSV columns: name, buy_price, sell_price, sku_code,
                  opening_stock. Up to 200 products per batch.
                </p>
                <a
                  href={`${process.env.NEXT_PUBLIC_WEB_BASE_PATH ?? ""}/product-import-template.csv`}
                  download
                >
                  Download template
                </a>
                <label>
                  Choose CSV
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={async (e) => {
                      setImportRows(null);
                      setError("");
                      try {
                        const file = e.target.files?.[0];
                        if (file)
                          setImportRows(parseProductsCsv(await file.text()));
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  />
                </label>
                {importRows && (
                  <>
                    <p className="sf-notice">
                      {importRows.length} valid products. All rows will be saved
                      together.
                    </p>
                    <div className="sf-import-preview">
                      {importRows.slice(0, 10).map((r, i) => (
                        <p key={i}>
                          {r.name} · {r.opening_stock} cases ·{" "}
                          {money(r.sell_price)}
                        </p>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
            <Button
              type="submit"
              disabled={busy || (form === "import" && !importRows)}
            >
              {busy
                ? "Saving…"
                : form === "import"
                  ? "Import all products"
                  : form === "cancel"
                    ? "Cancel sale"
                    : "Save"}
            </Button>
          </form>
        </Dialog>
      )}
    </div>
  );
}
function Heading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="sf-page-heading">
      <div>
        <span className="sf-eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
function Search({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="sf-search">
      <Icon name="search" />
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button aria-label="Clear search" onClick={() => onChange("")}>
          <Icon name="close" size={18} />
        </button>
      )}
    </div>
  );
}
function Metric({
  label,
  value,
  icon,
  featured,
}: {
  label: string;
  value: string;
  icon: string;
  featured?: boolean;
}) {
  return (
    <article className={`sf-metric ${featured ? "sf-metric--featured" : ""}`}>
      <div>
        <span>{label}</span>
        <Icon name={icon} />
      </div>
      <strong>{value}</strong>
      <small>
        {label === "Estimated gross profit"
          ? "Sales less recorded cost of goods"
          : "For the selected period"}
      </small>
    </article>
  );
}
function SaleRow({ sale, onClick }: { sale: Sale; onClick: () => void }) {
  return (
    <button className="sf-sale-row" onClick={onClick}>
      <span className="sf-product-icon">
        <Icon name="sales" />
      </span>
      <span className="sf-sale-who">
        <strong>{sale.customer_name}</strong>
        <small>
          {stamp(sale.created_at)} · {sale.total_cases} cases
        </small>
      </span>
      <span className="sf-sale-value">
        <strong>{money(sale.total_value)}</strong>
        <small className={`sf-status sf-status--${sale.status}`}>
          {sale.status}
        </small>
      </span>
    </button>
  );
}
function SalesChart({ points }: { points: Summary["trend"] }) {
  if (!points.length)
    return (
      <Empty
        title="Your next sale starts this chart"
        description="Completed sales appear here for the selected period."
      />
    );
  const max = Math.max(...points.map((x) => Number(x.revenue)), 1),
    w = 640,
    h = 180,
    pad = 18;
  const xy = points.map(
    (p, i) =>
      `${pad + (i * (w - pad * 2)) / Math.max(points.length - 1, 1)},${h - pad - (Number(p.revenue) / max) * (h - pad * 2)}`,
  );
  return (
    <div className="sf-chart">
      <div className="sf-chart-scale">
        <span>{money(max)}</span>
        <span>{money(max / 2)}</span>
        <span>₦0</span>
      </div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label="Daily completed sales revenue"
      >
        <defs>
          <linearGradient id="sf-chart-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1d8d6b" stopOpacity=".16" />
            <stop offset="100%" stopColor="#1d8d6b" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.2, 0.5, 0.8].map((y) => (
          <line
            key={y}
            x1="0"
            x2={w}
            y1={h * y}
            y2={h * y}
            stroke="currentColor"
            opacity=".08"
          />
        ))}
        <polygon
          points={`${pad},${h} ${xy.join(" ")} ${w - pad},${h}`}
          fill="url(#sf-chart-fill)"
        />
        <polyline
          points={xy.join(" ")}
          fill="none"
          stroke="#1d8d6b"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        {xy.map((p, i) => (
          <circle
            key={i}
            cx={p.split(",")[0]}
            cy={p.split(",")[1]}
            r="3"
            fill="#1d8d6b"
          >
            <title>
              {points[i].day}: {money(points[i].revenue)}
            </title>
          </circle>
        ))}
      </svg>
      <div className="sf-chart-dates">
        <span>{points[0].day}</span>
        <span>{points.at(-1)!.day}</span>
      </div>
    </div>
  );
}

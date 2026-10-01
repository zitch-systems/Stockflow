// V2 operations for retained dashboards. Apply the database migration first.
(function () {
  "use strict";
  // Quoting a CSV cell does not prevent spreadsheet formula execution. Parse
  // existing exports, preserve their data/columns, and neutralise formula text.
  window.stockflowSafeCsv = function (csv) {
    var bom = csv.charAt(0) === "\uFEFF" ? "\uFEFF" : "";
    var source = bom ? csv.slice(1) : csv;
    if (!source) return bom;
    var rows = [], row = [], field = "", quoted = false;
    for (var i = 0; i < source.length; i++) {
      var ch = source[i];
      if (ch === '"') {
        if (quoted && source[i + 1] === '"') { field += '"'; i++; }
        else quoted = !quoted;
      } else if (ch === "," && !quoted) { row.push(field); field = ""; }
      else if ((ch === "\r" || ch === "\n") && !quoted) {
        row.push(field); rows.push(row); row = []; field = "";
        if (ch === "\r" && source[i + 1] === "\n") i++;
      } else field += ch;
    }
    if (quoted) throw new Error("The export contains an incomplete quoted field.");
    var trailing = /[\r\n]$/.test(source);
    if (row.length || field || !trailing) { row.push(field); rows.push(row); }
    return bom + rows.map(function (cells) {
      return cells.map(function (text) {
        var trimmed = text.replace(/^[\s\u0000-\u001f]+/, "");
        if (/^[\t\r\n]/.test(text) || (/^[=+@-]/.test(trimmed) && !/^-?\d+(\.\d+)?$/.test(trimmed))) text = "'" + text;
        return '"' + text.replace(/"/g, '""') + '"';
      }).join(",");
    }).join("\r\n") + (trailing ? "\r\n" : "");
  };
  window.stockflowOperation = async function (name, parameters) {
    var actor = window.currentProfile && window.currentProfile.id;
    if (!actor) throw new Error("Sign in again before continuing.");
    var key = "sf-v2:" + actor + ":" + name;
    var stored = sessionStorage.getItem(key);
    var intent = stored ? JSON.parse(stored) : null;
    if (
      intent &&
      JSON.stringify(intent.parameters) !== JSON.stringify(parameters)
    ) {
      throw new Error(
        "An earlier request is unconfirmed. Retry its original details before starting another.",
      );
    }
    if (!intent) {
      intent = { id: crypto.randomUUID(), parameters: parameters };
      sessionStorage.setItem(key, JSON.stringify(intent));
    }
    var result = await window.sb.rpc(
      name,
      Object.assign({ p_request_id: intent.id }, intent.parameters),
    );
    if (result.error) {
      if (result.error.code && !/^5\d\d$/.test(result.error.code))
        sessionStorage.removeItem(key);
      throw result.error;
    }
    if (result.data === null || result.data === undefined)
      throw new Error("The result is unconfirmed. Retry this request.");
    sessionStorage.removeItem(key);
    return result.data;
  };
  window.stockflowInviteStaff = async function (parameters) {
    var actor = window.currentProfile && window.currentProfile.id;
    if (!actor) throw new Error("Sign in again before continuing.");
    var key = "sf-v2:" + actor + ":staff-invite";
    var raw = sessionStorage.getItem(key), intent = raw ? JSON.parse(raw) : null;
    if (intent && JSON.stringify(intent.parameters) !== JSON.stringify(parameters))
      throw new Error("An earlier invitation is unconfirmed. Retry its original details.");
    if (!intent) {
      intent = { id: crypto.randomUUID(), parameters: parameters };
      sessionStorage.setItem(key, JSON.stringify(intent));
    }
    var auth = await window.sb.auth.getSession();
    if (!auth.data.session) throw new Error("Sign in again before continuing.");
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 20000);
    try {
      var response = await fetch(window.sb.supabaseUrl + "/functions/v1/provision-stockflow-staff", {
        method: "POST", signal: controller.signal,
        headers: { "Authorization": "Bearer " + auth.data.session.access_token, "apikey": window.sb.supabaseKey, "Content-Type": "application/json" },
        body: JSON.stringify(Object.assign({request_id:intent.id},intent.parameters)),
      });
      var result = await response.json();
      if (!response.ok || result.ok !== true || typeof result.user_id !== "string") {
        if (response.status >= 400 && response.status < 500) sessionStorage.removeItem(key);
        throw new Error(result.error || "The invitation result is unconfirmed. Retry the same details.");
      }
      sessionStorage.removeItem(key);
      return result;
    } finally { clearTimeout(timer); }
  };
  window.openStockflowStaffInvite = function () {
    var actor = window.currentProfile && window.currentProfile.id;
    var raw = actor && sessionStorage.getItem("sf-v2:" + actor + ":staff-invite");
    var intent = raw ? JSON.parse(raw) : null;
    var data = intent ? intent.parameters : {};
    [["invFullName","full_name"],["invEmail","email"],["invPhone","phone"]].forEach(function (pair) {
      var el = document.getElementById(pair[0]); if (el) el.value = data[pair[1]] || "";
    });
    if (window.setInvRole) window.setInvRole(data.role || "rep");
    window.openM("mInviteStaff");
  };
  window.stockflowTransactionMessage = function (error) {
    var message = String((error && error.message) || "");
    if (error && error.code === "PGRST202")
      return "The transaction upgrade is not enabled yet. Ask your administrator to complete the V2 rollout.";
    if (error && error.code === "42501")
      return "Your account cannot perform this action.";
    if (/historical|stock source/i.test(message))
      return "This earlier sale needs an inventory review before cancellation. Ask your administrator.";
    if (/Stock changed/i.test(message))
      return "Stock changed. Refresh and check the available quantity.";
    if (/price|cost/i.test(message))
      return "Check the price. It must be valid and at least the cost price.";
    if (/earlier request|unconfirmed|different operation/i.test(message))
      return "An earlier request is unconfirmed. Retry its original details to retrieve the result.";
    return "Could not confirm this action. Check your connection and retry the same request.";
  };
})();

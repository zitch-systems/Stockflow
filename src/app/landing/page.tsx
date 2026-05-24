import Link from 'next/link';
import type { Metadata } from 'next';
import Nav from './Nav';
import InstallButton, { InstalledBadge } from './InstallButton';
import { IOSModal, IOSModalTrigger, IOSBottomBanner } from './IOSHelp';
import './landing.css';

export const metadata: Metadata = {
  title: 'StockFlow — Run your distribution business from your phone',
  description:
    'The simple, mobile-first stock and sales tool built for Nigerian distribution businesses. Track every case, every payment, every rep.',
};

const CHECK = (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="3"
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export default function LandingPage() {
  return (
    <>
      <Nav />

      {/* ───── HERO ───── */}
      <section className="lp-hero" id="top">
        <div className="lp-container">
          <div className="lp-hero-eyebrow">
            <span className="lp-hero-dot" />
            Now in early access · Built for Nigerian distribution businesses
          </div>
          <h1 className="lp-hero-title">
            Run your distribution business{' '}
            <span className="lp-highlight">from your phone.</span>
          </h1>
          <p className="lp-hero-sub">
            Track every case, every payment, every rep. No more notebooks, WhatsApp
            groups, or end-of-day arguments. Just clear numbers everyone trusts —
            built for Nigerian distribution businesses.
          </p>

          <div className="lp-hero-actions">
            <Link href="/signup" className="lp-btn lp-btn-primary">
              Get early access →
            </Link>
            <InstallButton
              className="lp-btn lp-btn-ghost-light"
              label="Install App"
            />
            <a href="#how" className="lp-btn lp-btn-ghost-light">
              See how it works
            </a>
            <InstalledBadge />
          </div>

          <div className="lp-hero-trust">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Free 14-day trial · No card required · Set up in 5 minutes
          </div>

          <div className="lp-hero-visual">
            {/* Phone 2 — Manager P&L */}
            <div className="lp-phone lp-phone-2">
              <div className="lp-phone-screen">
                <div className="lp-mock-topbar">
                  <div className="lp-mock-brand">
                    Stock<span>Flow</span>
                  </div>
                  <div className="lp-mock-tag">MGR</div>
                </div>
                <div className="lp-mock-greet">
                  <div className="lp-mock-greet-h">Profit & Loss</div>
                  <div className="lp-mock-greet-s">This Month · 142 sales</div>
                  <div className="lp-mock-greet-grid">
                    <div className="lp-mock-stat">
                      <div className="lp-mock-stat-l">Revenue</div>
                      <div className="lp-mock-stat-v">₦8.4M</div>
                    </div>
                    <div className="lp-mock-stat">
                      <div className="lp-mock-stat-l">Net Profit</div>
                      <div className="lp-mock-stat-v">₦1.2M</div>
                    </div>
                  </div>
                </div>
                <div className="lp-mock-pnl">
                  {[
                    ['Revenue', '₦8,420,000', ''],
                    ['Cash Collected', '₦7,180,000', 'pos'],
                    ['COGS', '−₦5,820,000', 'neg'],
                    ['Expenses', '−₦1,400,000', 'neg'],
                    ['Net Profit', '₦1,200,000', ''],
                  ].map(([l, v, tone]) => (
                    <div key={l} className="lp-mock-pnl-row">
                      <span className="lp-mock-pnl-l">{l}</span>
                      <span className={`lp-mock-pnl-v ${tone}`}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Phone 1 — Today's Sales */}
            <div className="lp-phone lp-phone-1">
              <div className="lp-phone-screen">
                <div className="lp-mock-topbar">
                  <div className="lp-mock-brand">
                    Stock<span>Flow</span>
                  </div>
                  <div className="lp-mock-tag">REP</div>
                </div>
                <div className="lp-mock-greet">
                  <div className="lp-mock-greet-h">Good afternoon, Chinonso</div>
                  <div className="lp-mock-greet-s">
                    12 sales today · ₦340K collected
                  </div>
                  <div className="lp-mock-greet-grid">
                    <div className="lp-mock-stat">
                      <div className="lp-mock-stat-l">Stock</div>
                      <div className="lp-mock-stat-v">38 cases</div>
                    </div>
                    <div className="lp-mock-stat">
                      <div className="lp-mock-stat-l">Debt</div>
                      <div className="lp-mock-stat-v">₦142K</div>
                    </div>
                  </div>
                </div>
                <div className="lp-mock-h">Today&apos;s Sales</div>
                {[
                  ['Mama Ngozi Stores', '3 cases · 2:14 PM', '₦42,000', ''],
                  ['Iya Risi Provisions', '5 cases · 1:48 PM', '₦68,500', ''],
                  ['Chuks Wholesale', '8 cases · 12:32 PM', '₦112,000', 'warn'],
                  ['Owerri Trading', '2 cases · 11:15 AM', '₦27,500', ''],
                ].map(([name, sub, val, tone]) => (
                  <div key={name} className="lp-mock-card">
                    <div className="lp-mock-card-row">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="lp-mock-pri">{name}</div>
                        <div className="lp-mock-sec">{sub}</div>
                      </div>
                      <div className={`lp-mock-val ${tone}`}>{val}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Phone 3 — Owner: Top Reps */}
            <div className="lp-phone lp-phone-3">
              <div className="lp-phone-screen">
                <div className="lp-mock-topbar">
                  <div className="lp-mock-brand">
                    Stock<span>Flow</span>
                  </div>
                  <div className="lp-mock-tag">OWNER</div>
                </div>
                <div className="lp-mock-greet">
                  <div className="lp-mock-greet-h">Outstanding Debt</div>
                  <div className="lp-mock-greet-s">By Sales Rep · This Month</div>
                </div>
                <div className="lp-mock-h">Top Reps</div>
                {[
                  ['Chinonso E.', '12 customers', '₦340K'],
                  ['Fatima A.', '8 customers', '₦220K'],
                  ['James A.', '6 customers', '₦185K'],
                  ['Bola H.', '4 customers', '₦92K'],
                ].map(([name, sub, val]) => (
                  <div key={name} className="lp-mock-rep">
                    <div>
                      <div className="lp-mock-rep-l">{name}</div>
                      <div className="lp-mock-rep-sub">{sub}</div>
                    </div>
                    <div className="lp-mock-rep-val">{val}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ───── INSTALL ───── */}
      <section style={{ background: 'var(--brand)', padding: '52px 0' }}>
        <div className="lp-container">
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                background: 'rgba(255,255,255,.12)',
                border: '1px solid rgba(255,255,255,.2)',
                borderRadius: 20,
                padding: '5px 14px',
                fontSize: 12,
                fontWeight: 600,
                color: 'rgba(255,255,255,.9)',
                marginBottom: 14,
                letterSpacing: '.06em',
                textTransform: 'uppercase',
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: '#34D399',
                  display: 'inline-block',
                }}
              />
              Available on all devices
            </div>
            <h2
              style={{
                color: '#fff',
                fontFamily: 'var(--font-sora)',
                fontSize: 'clamp(1.5rem, 4vw, 2.2rem)',
                fontWeight: 800,
                marginBottom: 10,
              }}
            >
              Get the app
            </h2>
            <p
              style={{
                color: 'rgba(255,255,255,.7)',
                maxWidth: 480,
                margin: '0 auto',
                fontSize: '.95rem',
              }}
            >
              iPhone, Android, or desktop — install straight from your browser.
              No App Store required.
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
              gap: 14,
              maxWidth: 760,
              margin: '0 auto',
            }}
          >
            {/* iOS */}
            <div className="lp-install-card">
              <div className="lp-install-card-icon">
                <svg width="26" height="26" viewBox="0 0 814 1000" fill="#0F2A44">
                  <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-37.5-155.5-127.4C46 790.7 0 663.9 0 541.8c0-203.7 132.4-311.1 261.7-311.1 67.2 0 123.1 44.5 164.8 44.5 39.6 0 101.5-47.7 176.3-47.7 28.5 0 130.9 2.6 198.3 99.2zM554.1 159.4c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z" />
                </svg>
              </div>
              <div>
                <div className="lp-install-card-title">iPhone &amp; iPad</div>
                <div className="lp-install-card-sub">
                  Open in Safari · Add to Home Screen
                </div>
              </div>
              <IOSModalTrigger
                className="lp-install-card-btn"
                // styled via inline; lp-install-card button base picked up from CSS
              >
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    background: '#fff',
                    color: '#0F2A44',
                    padding: '11px',
                    borderRadius: 9,
                    fontFamily: 'var(--font-sora)',
                    fontWeight: 700,
                    fontSize: '.84rem',
                    width: '100%',
                    justifyContent: 'center',
                    minHeight: 44,
                  }}
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  How to install
                </span>
              </IOSModalTrigger>
            </div>

            {/* Android */}
            <div className="lp-install-card">
              <div className="lp-install-card-icon">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="#34A853">
                  <path d="M5.1 5.4 4.1 4.4l1.3-1.3 1 1c.4-.2.9-.4 1.4-.5L8.5 2h7l.7 1.6c.5.1 1 .3 1.4.5l1-1 1.3 1.3-1 1c.5.6.9 1.3 1 2.1.1.4.1.8.1 1.2v4.5c0 .4 0 .8-.1 1.2-.1.8-.5 1.5-1 2.1l1 1-1.3 1.3-1-1c-.4.2-.9.4-1.4.5L15.5 22h-7l-.7-1.6c-.5-.1-1-.3-1.4-.5l-1 1L4.1 19.6l1-1c-.5-.6-.9-1.3-1-2.1-.1-.4-.1-.8-.1-1.2V10.7c0-.4 0-.8.1-1.2.1-.8.5-1.5 1-2.1ZM9 9v6h6V9H9Z" />
                </svg>
              </div>
              <div>
                <div className="lp-install-card-title">Android</div>
                <div className="lp-install-card-sub">
                  Chrome · &ldquo;Add to Home Screen&rdquo;
                </div>
              </div>
              <InstallButton
                showWhenUnavailable
                label="Install App"
                className="lp-install-android-btn"
              />
            </div>

            {/* Desktop */}
            <div className="lp-install-card">
              <div className="lp-install-card-icon">
                <svg
                  width="26"
                  height="26"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#1A3C5E"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <rect x="2" y="3" width="20" height="14" rx="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
              </div>
              <div>
                <div className="lp-install-card-title">Desktop</div>
                <div className="lp-install-card-sub">
                  Chrome / Edge · Install as app
                </div>
              </div>
              <InstallButton
                showWhenUnavailable
                label="Install App"
                className="lp-install-desktop-btn"
              />
            </div>
          </div>
          <p
            style={{
              textAlign: 'center',
              color: 'rgba(255,255,255,.45)',
              fontSize: '.75rem',
              marginTop: 18,
            }}
          >
            Works offline · No App Store · Free to install
          </p>
        </div>
      </section>

      {/* ───── PROBLEM ───── */}
      <section className="lp-section lp-problem">
        <div className="lp-container">
          <div className="lp-eyebrow">Sound familiar?</div>
          <h2 className="lp-section-title">
            Distribution is hard.{' '}
            <span className="lp-highlight">The paperwork shouldn&apos;t be.</span>
          </h2>
          <p className="lp-section-sub">
            Most distribution businesses still run on stitched-together notebooks,
            WhatsApp messages, and Excel sheets that nobody trusts. Things slip
            through.
          </p>
          <div className="lp-problem-grid">
            {[
              [
                'My rep says he sold 12 cases. The customer says she got 10. Who do I believe?',
                'Without a single source of truth, every dispute becomes a he-said-she-said argument. Cases go missing. Trust erodes.',
                'Stock disputes',
              ],
              [
                'How much do my customers owe me right now? Across all my reps?',
                'If the answer takes more than 3 seconds, your cash flow has a leak. By the time you find it, the money is gone.',
                'Hidden debt',
              ],
              [
                'Did I make money this month? Or am I just moving cases for free?',
                "Revenue isn't profit. Without tracking buy prices, expenses, and what's actually been collected, you don't know.",
                'Profit blind spot',
              ],
            ].map(([q, a, tag]) => (
              <div key={tag} className="lp-problem-card">
                <div className="lp-problem-q">{q}</div>
                <div className="lp-problem-a">{a}</div>
                <div className="lp-problem-tag">{tag}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───── FEATURES ───── */}
      <section className="lp-section lp-features-bg" id="how">
        <div className="lp-container">
          <div className="lp-eyebrow">How it works</div>
          <h2 className="lp-section-title">
            A complete picture,{' '}
            <span className="lp-highlight">updated as it happens.</span>
          </h2>
          <p className="lp-section-sub">
            StockFlow gives every person in your business the screen they need —
            and only what they need. Reps focus on selling. Managers approve and
            confirm. Owners see the whole picture.
          </p>
          <div className="lp-features-grid">
            {FEATURES.map(({ icon, title, body }) => (
              <div key={title} className="lp-feature">
                <div className="lp-feature-icon">{icon}</div>
                <div className="lp-feature-title">{title}</div>
                <div className="lp-feature-text">{body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───── ROLES ───── */}
      <section className="lp-section lp-roles" id="roles">
        <div className="lp-container">
          <div className="lp-eyebrow">Built for the whole team</div>
          <h2 className="lp-section-title">
            Four roles.{' '}
            <span className="lp-highlight">One source of truth.</span>
          </h2>
          <p className="lp-section-sub">
            Every person logs in to a screen built for what they actually do —
            nothing more, nothing less.
          </p>
          <div className="lp-roles-grid">
            {ROLES.map(({ klass, tag, title, sub, bullets }) => (
              <div key={tag} className={`lp-role-card ${klass}`}>
                <div className="lp-role-tag">{tag}</div>
                <div className="lp-role-title">{title}</div>
                <div className="lp-role-text">{sub}</div>
                <ul className="lp-role-bullets">
                  {bullets.map((b) => (
                    <li key={b}>
                      {CHECK}
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───── EARLY ACCESS ───── */}
      <section className="lp-section lp-early">
        <div className="lp-container">
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div className="lp-eyebrow">Early access</div>
            <h2
              className="lp-section-title"
              style={{ marginLeft: 'auto', marginRight: 'auto' }}
            >
              What that means <span className="lp-highlight">for you.</span>
            </h2>
          </div>
          <div className="lp-early-grid">
            {EARLY.map(({ title, body, icon }) => (
              <div key={title} className="lp-early-card">
                <div className="lp-early-icon">{icon}</div>
                <div className="lp-early-title">{title}</div>
                <div className="lp-early-text">{body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───── PRICING ───── */}
      <section className="lp-section lp-pricing-bg" id="pricing">
        <div className="lp-container">
          <div style={{ textAlign: 'center' }}>
            <div className="lp-eyebrow">Simple pricing</div>
            <h2
              className="lp-section-title"
              style={{ marginLeft: 'auto', marginRight: 'auto' }}
            >
              Try it free. <span className="lp-highlight">For real.</span>
            </h2>
            <p
              className="lp-section-sub"
              style={{ marginLeft: 'auto', marginRight: 'auto' }}
            >
              14 days, no credit card. If StockFlow doesn&apos;t make your business
              clearer, just walk away. We&apos;ll talk pricing only when you&apos;re sure
              it&apos;s worth it.
            </p>
          </div>
          <div className="lp-pricing-card">
            <div className="lp-pricing-tag">Early Access · Trial</div>
            <div className="lp-pricing-price">
              <em>₦</em>0
            </div>
            <div className="lp-pricing-period">
              for 14 days · we&apos;ll talk pricing once you&apos;ve used it
            </div>
            <ul className="lp-pricing-features">
              {[
                'Unlimited sales records',
                'Unlimited products and customers',
                'Up to 10 sales reps + 3 managers',
                'Real-time P&L and reports',
                'WhatsApp share for everything',
                'Direct support from the team',
              ].map((b) => (
                <li key={b}>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  {b}
                </li>
              ))}
            </ul>
            <Link
              href="/signup"
              className="lp-btn lp-btn-primary"
              style={{ width: '100%', justifyContent: 'center', padding: 14, fontSize: 15 }}
            >
              Get early access →
            </Link>
            <div className="lp-pricing-note">
              We&apos;ll never auto-charge you. After your trial, we have a
              conversation about what makes sense for your business — not a forced
              renewal.
            </div>
          </div>
        </div>
      </section>

      {/* ───── FAQ ───── */}
      <section className="lp-section lp-faq" id="faq">
        <div className="lp-container">
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <div className="lp-eyebrow">Honest answers</div>
            <h2
              className="lp-section-title"
              style={{ marginLeft: 'auto', marginRight: 'auto' }}
            >
              Things you might be wondering.
            </h2>
          </div>
          <div className="lp-faq-list">
            {FAQ.map(([q, a]) => (
              <details key={q} className="lp-faq-item">
                <summary className="lp-faq-q">
                  {q}
                  <span className="lp-faq-mark">+</span>
                </summary>
                <div className="lp-faq-a">{a}</div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ───── CONTACT ───── */}
      <section className="lp-section lp-contact" id="contact">
        <div className="lp-container">
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div className="lp-eyebrow">Get in touch</div>
            <h2
              className="lp-section-title"
              style={{ marginLeft: 'auto', marginRight: 'auto' }}
            >
              Let&apos;s talk.
            </h2>
            <p
              className="lp-section-sub"
              style={{ marginLeft: 'auto', marginRight: 'auto' }}
            >
              Reach us directly — no ticket queues, no chatbots.
            </p>
          </div>
          <div className="lp-contact-grid">
            <a href="tel:+2348166938327" className="lp-contact-card">
              <div className="lp-contact-icon">
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
                </svg>
              </div>
              <div className="lp-contact-label">Phone</div>
              <div className="lp-contact-value">0816 693 8327</div>
            </a>
            <a
              href="https://wa.me/2348166938327"
              target="_blank"
              rel="noopener noreferrer"
              className="lp-contact-card"
            >
              <div
                className="lp-contact-icon"
                style={{ background: '#F0FDF4', color: '#16A34A' }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
              </div>
              <div className="lp-contact-label">WhatsApp</div>
              <div className="lp-contact-value">0816 693 8327</div>
            </a>
            <div className="lp-contact-card">
              <div
                className="lp-contact-icon"
                style={{ background: '#FEF2F2', color: '#DC2626' }}
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
              </div>
              <div className="lp-contact-label">Address</div>
              <div className="lp-contact-value">
                41 Ogudu Road,<br />Lagos, Nigeria
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ───── FINAL CTA ───── */}
      <div className="lp-final-wrap">
        <div className="lp-final">
          <h2 className="lp-final-title">
            Stop guessing.{' '}
            <span className="lp-highlight">Start knowing.</span>
          </h2>
          <p className="lp-final-sub">
            Get early access today. 14 days free. No card. Direct line to the team
            if anything goes wrong.
          </p>
          <Link href="/signup" className="lp-btn">
            Create your free account →
          </Link>
        </div>
      </div>

      {/* ───── FOOTER ───── */}
      <footer className="lp-footer">
        <div className="lp-container lp-foot-inner">
          <div className="lp-foot-brand">
            <div className="lp-foot-mark">S</div>
            <span
              style={{
                fontFamily: 'var(--font-sora)',
                fontWeight: 700,
                color: 'var(--ts)',
                letterSpacing: '-0.015em',
              }}
            >
              StockFlow
            </span>
            <span style={{ color: 'var(--tm)', marginLeft: 8 }}>© 2026</span>
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              gap: 6,
              textAlign: 'right',
            }}
          >
            <div style={{ fontSize: 13, color: 'var(--ts)' }}>
              41 Ogudu Road, Lagos, Nigeria
            </div>
            <div style={{ fontSize: 13, color: 'var(--ts)' }}>
              <a
                href="tel:+2348166938327"
                style={{ color: 'var(--brand-mid)', fontWeight: 500 }}
              >
                0816 693 8327
              </a>{' '}
              ·{' '}
              <a
                href="https://wa.me/2348166938327"
                style={{ color: 'var(--success)', fontWeight: 500 }}
              >
                WhatsApp
              </a>
            </div>
          </div>
        </div>
      </footer>

      <IOSModal />
      <IOSBottomBanner />
    </>
  );
}

const FEATURES = [
  {
    title: 'Reps record every sale on their phone',
    body: 'No paperwork. They tap the customer, scan the products, the system updates inventory and tracks who owes what. Cash sales close immediately. Credit sales sit pending until paid.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
      </svg>
    ),
  },
  {
    title: 'Managers confirm payments instantly',
    body: 'When the rep collects ₦50,000, manager taps to confirm — debt drops, P&L updates, everyone is in sync. No spreadsheet to update at end of day. No reconciliation meeting.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    ),
  },
  {
    title: 'A real Profit & Loss, in real time',
    body: 'Revenue, COGS, expenses, net profit — by day, week or month. Backed by the actual buy prices at the time of each sale. No spreadsheet gymnastics needed.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 100 7h5a3.5 3.5 0 110 7H6" />
      </svg>
    ),
  },
  {
    title: 'KYC for every sales rep',
    body: 'When you give a rep ₦300,000 worth of stock on credit, you need their NIN, BVN, address, bank, and a guarantor. StockFlow stores it all. So if anything goes wrong, you have what you need.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
        <circle cx="8.5" cy="7" r="4" />
        <path d="M20 8v6M23 11h-6" />
      </svg>
    ),
  },
  {
    title: 'Receipts & reports as images',
    body: 'Every sale generates a clean receipt. Every report — P&L, ledger, supplier balance — can be shared as an image to WhatsApp in two taps. Branded with your business name.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="18" cy="5" r="3" />
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
      </svg>
    ),
  },
  {
    title: 'Owner approves what matters',
    body: 'Price changes, supplier orders, hiring new reps — they all flow to the owner for approval, with full context. You stay in control even when you’re not on site.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0110 0v4" />
      </svg>
    ),
  },
];

const ROLES = [
  {
    klass: 'r-rep',
    tag: 'Rep',
    title: 'Sales Rep',
    sub: 'In the market. Selling. Collecting cash and credit.',
    bullets: [
      'Record cash and credit sales',
      'Track personal stock holdings',
      'See debt from each customer',
      'Request more stock',
    ],
  },
  {
    klass: 'r-mgr',
    tag: 'Manager',
    title: 'Branch Manager',
    sub: 'In the warehouse. Confirming payments. Restocking.',
    bullets: [
      'Confirm rep payments',
      'Receive supplier inventory',
      'Approve stock requests',
      'Log expenses and supplier debt',
    ],
  },
  {
    klass: 'r-own',
    tag: 'Owner',
    title: 'Business Owner',
    sub: 'Watching the whole business. Approving the big stuff.',
    bullets: [
      'Live P&L across all branches',
      'Approve price changes & orders',
      'Hire and manage staff',
      'Audit trail of everything',
    ],
  },
];

const EARLY = [
  {
    title: 'A direct line to the team',
    body: "When something breaks, message us directly — not a ticket queue. We respond same-day. You'll hear from the people building StockFlow, not a chatbot.",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
      </svg>
    ),
  },
  {
    title: 'Influence on what gets built',
    body: 'Early customers shape the roadmap. The features you ask for are the features we build next. That tapers off as we grow.',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
  },
  {
    title: 'Locked-in introductory pricing',
    body: 'Whatever rate you start at stays your rate, even as our pricing increases for new customers later.',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0110 0v4" />
      </svg>
    ),
  },
];

const FAQ: Array<[string, string]> = [
  [
    "What if my reps don't have smartphones?",
    "Most reps have a phone they use for WhatsApp. That same phone runs StockFlow — there's nothing to install (it's just a website). For reps who genuinely don't have one, you can record their sales from your own phone or a manager's phone. We don't recommend it long-term, but it's not a blocker on day one.",
  ],
  [
    'What about poor network in some areas?',
    "Honest answer: today, you need connectivity to record a sale. We're working on offline-first sales recording (record now, sync when back online) — that's high on our roadmap. In the meantime, the app works on 3G fine and uses minimal data. A typical rep working a full day uses less than 50MB.",
  ],
  [
    'What happens to my data if I stop using StockFlow?',
    "It's your data. We'll export every sale, every payment, every product, every customer record as CSV files you can open in Excel — no questions asked. We don't believe in lock-in. If you decide we're not for you, you walk away with everything.",
  ],
  [
    'How is my data secured? My P&L is sensitive.',
    'Every business on StockFlow is fully isolated — your data is never visible to any other business, even if a hypothetical bug existed. We enforce this at the database level (row-level security), not just in our app code. All connections are encrypted (HTTPS). Your data is hosted on infrastructure compliant with Nigerian data protection requirements (NDPR).',
  ],
  [
    "What if I need a feature you don't have?",
    "Tell us. In early access, the features we build next are decided by what our pilot customers ask for. The product is shaped by real distribution businesses — that's actually the main reason we want you in early. Send us a WhatsApp message; we'll discuss it.",
  ],
  [
    'Is this an established product? Should I trust it with real data?',
    "We're early. We don't have hundreds of customers to point to, and we won't pretend otherwise. The trade-off you make in early access: you get a more attentive partnership, lower introductory pricing, and direct influence on the roadmap. The risk you take: rough edges, occasional bugs, fewer integrations than you'd find in a mature tool. If you'd rather wait for the \"safe\" version, that's a fair call. If you want in now, you'll be among the first.",
  ],
];

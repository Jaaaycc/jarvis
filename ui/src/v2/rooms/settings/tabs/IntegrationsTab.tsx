import React, { useCallback, useEffect, useRef, useState } from "react";
import type { SettingsHook } from "../useSettingsData";

export function IntegrationsTab({
  data,
  onToast,
}: {
  data: SettingsHook;
  onToast: (text: string, tone?: "ok" | "warn") => void;
}) {
  const g = data.google;
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [phase, setPhase] = useState<"idle" | "saving" | "authenticating">("idle");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      if (event.data === "google-auth-complete") {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        setPhase("idle");
        onToast("Connected. Restart Jarvis to activate all Google services.", "ok");
        data.refresh();
      }
    },
    [data, onToast],
  );

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const handleSaveCredentials = async () => {
    if (!clientId.trim() || !clientSecret.trim()) {
      onToast("Both Client ID and Client Secret are required.", "warn");
      return;
    }
    setPhase("saving");
    const r = await data.saveGoogleCredentials({ client_id: clientId.trim(), client_secret: clientSecret.trim() });
    onToast(r.message, r.ok ? "ok" : "warn");
    if (r.ok) { setClientId(""); setClientSecret(""); }
    setPhase("idle");
  };

  const handleConnect = async () => {
    const r = await data.initGoogleAuth();
    if (!r.ok) { onToast(r.message, "warn"); return; }
    setPhase("authenticating");
    window.open(r.auth_url, "google-auth", "width=600,height=700");
    let polls = 0;
    pollRef.current = setInterval(async () => {
      polls++;
      if (polls > 40) {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        setPhase("idle");
        onToast("Authorization timed out. Try again.", "warn");
        return;
      }
      try {
        const status = await fetch("/api/auth/google/status").then((r) => r.json());
        if (status?.is_authenticated) {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setPhase("idle");
          onToast("Connected. Restart Jarvis to activate all Google services.", "ok");
          data.refresh();
        }
      } catch { /* poll error */ }
    }, 3000);
  };

  const handleDisconnect = async () => {
    if (!confirm("Disconnect Google? You'll need to re-authorize to reconnect.")) return;
    const r = await data.disconnectGoogle();
    onToast(r.message, r.ok ? "ok" : "warn");
  };

  const hasAnalyticsScopes = g?.scopes?.some(
    (s) => s.includes("analytics") || s.includes("webmasters")
  ) ?? false;

  return (
    <div>
      {/* ── Google ── */}
      <section className="v2-set__section">
        <div className="v2-set__section-head">
          <div>
            <h3 className="v2-set__section-title">Google</h3>
            <div className="v2-set__section-sub">
              Gmail · Calendar · Search Console · Analytics · Gmail Send
            </div>
          </div>
          {g && (
            <span className={"v2-set__chip " + (g.status === "connected" ? "v2-set__chip--ok" : g.status === "credentials_saved" ? "v2-set__chip--warn" : "")}>
              {g.status.replace(/_/g, " ")}
            </span>
          )}
        </div>

        {!g || g.status === "not_configured" ? (
          <>
            <p className="v2-set__hint">
              Create OAuth 2.0 credentials at{" "}
              <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer" style={{ color: "var(--ok)" }}>
                Google Cloud Console
              </a>.
              Add redirect URI: <code style={{ fontSize: "11px", background: "var(--paper-3)", padding: "2px 4px", borderRadius: "3px" }}>http://localhost:3142/api/auth/google/callback</code>
            </p>
            <div className="v2-set__field">
              <label className="v2-set__field-label">Client ID</label>
              <input className="v2-set__input" value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="769520053593-xxx.apps.googleusercontent.com" />
            </div>
            <div className="v2-set__field">
              <label className="v2-set__field-label">Client secret</label>
              <input className="v2-set__input" type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button type="button" className="v2-set__btn v2-set__btn--primary" onClick={handleSaveCredentials}>
                Save credentials
              </button>
            </div>
          </>
        ) : phase === "saving" ? (
          <div className="v2-set__empty">Saving…</div>
        ) : g.status === "credentials_saved" && phase === "idle" ? (
          <>
            <p className="v2-set__hint">Credentials saved. Connect your Google account to authorize all scopes.</p>
            <div style={{ display: "flex", gap: "var(--s-2)", flexWrap: "wrap" }}>
              <button type="button" className="v2-set__btn v2-set__btn--primary" onClick={handleConnect}>
                Connect Google account
              </button>
            </div>
            <p className="v2-set__hint">Grants access to: Gmail, Calendar, Search Console, Analytics, Gmail Send.</p>
          </>
        ) : phase === "authenticating" ? (
          <div className="v2-set__empty">Waiting for Google authorization in the popup…</div>
        ) : (
          <>
            <div className="v2-set__row">
              <span className="v2-set__row-label">Gmail</span>
              <span className="v2-set__row-value"><span className="v2-set__dot v2-set__dot--ok" /> read + send</span>
            </div>
            <div className="v2-set__row">
              <span className="v2-set__row-label">Calendar</span>
              <span className="v2-set__row-value"><span className="v2-set__dot v2-set__dot--ok" /> read-only</span>
            </div>
            <div className="v2-set__row">
              <span className="v2-set__row-label">Search Console</span>
              <span className="v2-set__row-value">
                {hasAnalyticsScopes
                  ? <><span className="v2-set__dot v2-set__dot--ok" /> read-only</>
                  : <><span className="v2-set__dot v2-set__dot--warn" /> not authorized — re-authorize</>}
              </span>
            </div>
            <div className="v2-set__row">
              <span className="v2-set__row-label">Google Analytics</span>
              <span className="v2-set__row-value">
                {hasAnalyticsScopes
                  ? <><span className="v2-set__dot v2-set__dot--ok" /> read-only</>
                  : <><span className="v2-set__dot v2-set__dot--warn" /> not authorized — re-authorize</>}
              </span>
            </div>
            {!hasAnalyticsScopes && (
              <div style={{ padding: "var(--s-3)", background: "color-mix(in srgb, var(--warn) 10%, var(--paper-2))", border: "1px solid color-mix(in srgb, var(--warn) 30%, var(--rule-soft))", borderRadius: "var(--r-2)", margin: "var(--s-2) 0" }}>
                <p style={{ fontSize: "var(--text-sm)", color: "var(--warn)", margin: 0 }}>
                  ⚠️ Analytics &amp; Search Console require re-authorization. Click <strong>Re-authorize</strong> to grant access.
                </p>
              </div>
            )}
            {g.token_expiry && (
              <div className="v2-set__row">
                <span className="v2-set__row-label">Token expires</span>
                <span className="v2-set__row-value">{new Date(g.token_expiry).toLocaleString()}</span>
              </div>
            )}
            <div style={{ display: "flex", gap: "var(--s-2)", justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button type="button" className="v2-set__btn v2-set__btn--primary" onClick={handleConnect}>
                Re-authorize
              </button>
              <button type="button" className="v2-set__btn v2-set__btn--danger" onClick={handleDisconnect}>
                Disconnect
              </button>
            </div>
          </>
        )}
      </section>

      {/* ── n8n ── */}
      <section className="v2-set__section">
        <div className="v2-set__section-head">
          <div>
            <h3 className="v2-set__section-title">n8n Automation</h3>
            <div className="v2-set__section-sub">
              Monitor and trigger workflows from your n8n cloud instance.
            </div>
          </div>
        </div>
        <N8nIntegrationPanel onToast={onToast} />
      </section>

      {/* ── Facebook ── */}
      <section className="v2-set__section">
        <div className="v2-set__section-head">
          <div>
            <h3 className="v2-set__section-title">Facebook / Meta</h3>
            <div className="v2-set__section-sub">
              Connect your Facebook page for one-click publishing from the Marketing room.
            </div>
          </div>
        </div>
        <FacebookIntegrationPanel onToast={onToast} />
      </section>

      {/* ── NVIDIA ── */}
      <section className="v2-set__section">
        <div className="v2-set__section-head">
          <div>
            <h3 className="v2-set__section-title">NVIDIA AI</h3>
            <div className="v2-set__section-sub">
              Free API key for AI video generation.{" "}
              <a href="https://build.nvidia.com" target="_blank" rel="noreferrer" style={{ color: "var(--ok)" }}>Get yours at build.nvidia.com →</a>
            </div>
          </div>
        </div>
        <NvidiaIntegrationPanel onToast={onToast} />
      </section>
    </div>
  );
}

/* ── n8n panel ── */
function N8nIntegrationPanel({ onToast }: { onToast: (t: string, tone?: "ok" | "warn") => void }) {
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://jacobworkinai.app.n8n.cloud");
  const [saving, setSaving] = useState(false);
  const [configured, setConfigured] = useState(false);

  useEffect(() => {
    fetch("/api/n8n/status").then(r => r.json()).then((d: any) => {
      setConfigured(d?.configured ?? false);
      if (d?.baseUrl) setBaseUrl(d.baseUrl);
    }).catch(() => {});
  }, []);

  const save = async () => {
    if (!apiKey.trim()) { onToast("API key required.", "warn"); return; }
    setSaving(true);
    try {
      const r = await fetch("/api/config/n8n", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: apiKey.trim(), base_url: baseUrl.trim() }),
      });
      const d = await r.json() as any;
      onToast(d?.message ?? "n8n configured.", "ok");
      setConfigured(true);
      setApiKey("");
    } catch { onToast("Failed to save n8n config.", "warn"); }
    setSaving(false);
  };

  return (
    <>
      {configured && <div className="v2-set__row"><span className="v2-set__row-label">Status</span><span className="v2-set__row-value"><span className="v2-set__dot v2-set__dot--ok" /> Connected to n8n cloud</span></div>}
      <div className="v2-set__field">
        <label className="v2-set__field-label">n8n Instance URL</label>
        <input className="v2-set__input" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="https://your-instance.app.n8n.cloud" />
      </div>
      <div className="v2-set__field">
        <label className="v2-set__field-label">API Key</label>
        <input className="v2-set__input" type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="From n8n Settings → API" />
        <p className="v2-set__hint">In n8n: Settings → API → Create an API Key</p>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button type="button" className="v2-set__btn v2-set__btn--primary" onClick={save} disabled={saving}>
          {saving ? "Saving…" : configured ? "Update n8n" : "Connect n8n"}
        </button>
      </div>
    </>
  );
}

/* ── Facebook panel ── */
function FacebookIntegrationPanel({ onToast }: { onToast: (t: string, tone?: "ok" | "warn") => void }) {
  const [pageId, setPageId] = useState("");
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [configured, setConfigured] = useState(false);

  useEffect(() => {
    fetch("/api/meta/status").then(r => r.json()).then((d: any) => {
      setConfigured(d?.connected ?? false);
      if (d?.pageId) setPageId(d.pageId);
    }).catch(() => {});
  }, []);

  const save = async () => {
    if (!pageId.trim() || !token.trim()) { onToast("Page ID and access token required.", "warn"); return; }
    setSaving(true);
    try {
      const r = await fetch("/api/meta/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: token.trim(), adAccountId: "", pageId: pageId.trim() }),
      });
      const d = await r.json() as any;
      onToast(d?.ok ? "Facebook page connected." : "Failed to save.", d?.ok ? "ok" : "warn");
      if (d?.ok) { setConfigured(true); setToken(""); }
    } catch { onToast("Failed to save Facebook config.", "warn"); }
    setSaving(false);
  };

  return (
    <>
      {configured && <div className="v2-set__row"><span className="v2-set__row-label">Status</span><span className="v2-set__row-value"><span className="v2-set__dot v2-set__dot--ok" /> Page connected</span></div>}
      <div className="v2-set__field">
        <label className="v2-set__field-label">Facebook Page ID</label>
        <input className="v2-set__input" value={pageId} onChange={e => setPageId(e.target.value)} placeholder="123456789" />
      </div>
      <div className="v2-set__field">
        <label className="v2-set__field-label">Page Access Token</label>
        <input className="v2-set__input" type="password" value={token} onChange={e => setToken(e.target.value)} placeholder="EAAxxxxx..." />
        <p className="v2-set__hint">
          Get from{" "}
          <a href="https://developers.facebook.com/tools/explorer" target="_blank" rel="noreferrer" style={{ color: "var(--ok)" }}>
            Meta Graph API Explorer
          </a>{" "}
          — select your page and generate a Page Access Token.
        </p>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button type="button" className="v2-set__btn v2-set__btn--primary" onClick={save} disabled={saving}>
          {saving ? "Saving…" : configured ? "Update Facebook" : "Connect Facebook"}
        </button>
      </div>
    </>
  );
}

/* ── NVIDIA panel ── */
function NvidiaIntegrationPanel({ onToast }: { onToast: (t: string, tone?: "ok" | "warn") => void }) {
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [configured, setConfigured] = useState(false);

  useEffect(() => {
    fetch("/api/videogen/status").then(r => r.json()).then((d: any) => {
      setConfigured(d?.nvidiaConfigured ?? false);
    }).catch(() => {});
  }, []);

  const save = async () => {
    if (!apiKey.trim()) { onToast("API key required.", "warn"); return; }
    setSaving(true);
    try {
      const r = await fetch("/api/config/nvidia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: apiKey.trim() }),
      });
      const d = await r.json() as any;
      onToast(d?.message ?? "NVIDIA key saved.", "ok");
      setConfigured(true);
      setApiKey("");
    } catch { onToast("Failed to save NVIDIA key.", "warn"); }
    setSaving(false);
  };

  return (
    <>
      {configured && <div className="v2-set__row"><span className="v2-set__row-label">Status</span><span className="v2-set__row-value"><span className="v2-set__dot v2-set__dot--ok" /> API key configured</span></div>}
      {!configured && <div className="v2-set__row"><span className="v2-set__row-label">Status</span><span className="v2-set__row-value"><span className="v2-set__dot v2-set__dot--warn" /> Using Pollinations fallback</span></div>}
      <div className="v2-set__field">
        <label className="v2-set__field-label">NVIDIA API Key</label>
        <input className="v2-set__input" type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="nvapi-xxxxxxx" />
        <p className="v2-set__hint">Free tier available. Sign up at <a href="https://build.nvidia.com" target="_blank" rel="noreferrer" style={{ color: "var(--ok)" }}>build.nvidia.com</a></p>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button type="button" className="v2-set__btn v2-set__btn--primary" onClick={save} disabled={saving}>
          {saving ? "Saving…" : configured ? "Update NVIDIA Key" : "Save NVIDIA Key"}
        </button>
      </div>
    </>
  );
}

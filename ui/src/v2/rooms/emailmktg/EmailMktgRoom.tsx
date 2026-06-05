import React, { useState } from "react";
import {
  Download,
  ExternalLink,
  Mail,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  Send,
  Trash2,
  Users,
} from "lucide-react";
import { Icon } from "../../ui";
import { RoomShell } from "../RoomShell";
import { useRoomActions } from "../useRoomActionBus";
import { useEmailMktgData, type EmailCampaign } from "./useEmailMktgData";
import "./EmailMktgRoom.css";

export type RoomBodyMode = "inline" | "expanded";

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  sending: "Sending…",
  sent: "Sent",
  failed: "Failed",
};

export function EmailMktgRoomBody({ mode }: { mode: RoomBodyMode }) {
  const data = useEmailMktgData();
  const [scrapeQuery, setScrapeQuery] = useState("restaurant");
  const [scrapeLocation, setScrapeLocation] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);

  useRoomActions("emailmktg", (action, args) => {
    if (action === "scrape") {
      data.scrapLeads(String(args.query ?? ""), String(args.location ?? ""));
      data.setTab("leads");
      return true;
    }
    return false;
  });

  const handleNewCampaign = () => {
    data.createCampaign({
      name: "New Campaign",
      subject: "",
      body: "",
    });
    data.setTab("compose");
  };

  const handleSend = async () => {
    if (!data.selectedCampaign) return;
    setSendError(null);
    setSendSuccess(null);
    try {
      await data.sendCampaign(data.selectedCampaign.id);
      setSendSuccess("Campaign sent successfully!");
    } catch (e: any) {
      setSendError(e?.message ?? "Failed to send");
    }
  };

  const selected = data.selectedCampaign;

  return (
    <RoomShell roomKey="emailmktg" mode={mode} title="Email Marketing">
      <div className="v2-emailmktg">
        {/* ── Toolbar ── */}
        <div className="v2-emailmktg__toolbar">
          <div className="v2-emailmktg__tab-group" role="tablist">
            <button
              role="tab"
              aria-selected={data.tab === "campaigns"}
              className="v2-emailmktg__tab"
              onClick={() => data.setTab("campaigns")}
            >
              <Icon icon={Mail} size="sm" /> Campaigns
            </button>
            <button
              role="tab"
              aria-selected={data.tab === "leads"}
              className="v2-emailmktg__tab"
              onClick={() => data.setTab("leads")}
            >
              <Icon icon={Users} size="sm" /> Leads ({data.leads.length})
            </button>
          </div>
          <div className="v2-emailmktg__spacer" />
          {data.tab === "campaigns" && (
            <button className="v2-emailmktg__action-btn v2-emailmktg__action-btn--primary" onClick={handleNewCampaign}>
              <Plus size={12} /> New Campaign
            </button>
          )}
          {data.tab === "leads" && data.leads.length > 0 && (
            <button className="v2-emailmktg__action-btn" onClick={data.exportLeadsCSV}>
              <Download size={12} /> Export CSV
            </button>
          )}
          <button className="v2-emailmktg__action-btn" onClick={data.refresh}>
            <RefreshCw size={12} /> Refresh
          </button>
        </div>

        {/* ── Campaigns tab ── */}
        {data.tab === "campaigns" && (
          <div className="v2-emailmktg__body">
            {/* Campaign list */}
            <div className="v2-emailmktg__campaign-list">
              <div className="v2-emailmktg__list-header">
                {data.campaigns.length} campaign{data.campaigns.length !== 1 ? "s" : ""}
              </div>
              {data.loadingCampaigns && (
                <div className="v2-emailmktg__loading">Loading…</div>
              )}
              {data.campaigns.map((c) => (
                <div
                  key={c.id}
                  className="v2-emailmktg__campaign-item"
                  aria-selected={data.selectedCampaign?.id === c.id}
                  onClick={() => { data.setSelectedCampaign(c); data.setTab("compose"); }}
                >
                  <div className="v2-emailmktg__campaign-name">{c.name}</div>
                  <div className="v2-emailmktg__campaign-meta">
                    <span
                      className="v2-emailmktg__status-dot"
                      data-status={c.status}
                    />
                    {STATUS_LABEL[c.status]}
                    {c.recipientCount > 0 && ` · ${c.recipientCount} recipients`}
                    {c.sentAt && ` · ${new Date(c.sentAt).toLocaleDateString()}`}
                  </div>
                </div>
              ))}
              {!data.loadingCampaigns && data.campaigns.length === 0 && (
                <div className="v2-emailmktg__loading">No campaigns yet</div>
              )}
            </div>

            {/* Editor placeholder when nothing selected */}
            <div className="v2-emailmktg__editor">
              {!selected ? (
                <div className="v2-emailmktg__editor-empty">
                  Select a campaign to edit, or create a new one
                </div>
              ) : (
                <CampaignEditor
                  campaign={selected}
                  onUpdate={(patch) => data.updateCampaign(selected.id, patch)}
                  onSend={handleSend}
                  onDelete={() => data.deleteCampaign(selected.id)}
                  sendError={sendError}
                  sendSuccess={sendSuccess}
                  isGoogleConnected={data.isGoogleConnected}
                />
              )}
            </div>
          </div>
        )}

        {/* ── Compose tab (direct access from campaign click) ── */}
        {data.tab === "compose" && (
          <div className="v2-emailmktg__body">
            <div className="v2-emailmktg__campaign-list">
              <div className="v2-emailmktg__list-header">
                {data.campaigns.length} campaign{data.campaigns.length !== 1 ? "s" : ""}
              </div>
              {data.campaigns.map((c) => (
                <div
                  key={c.id}
                  className="v2-emailmktg__campaign-item"
                  aria-selected={data.selectedCampaign?.id === c.id}
                  onClick={() => data.setSelectedCampaign(c)}
                >
                  <div className="v2-emailmktg__campaign-name">{c.name}</div>
                  <div className="v2-emailmktg__campaign-meta">
                    <span className="v2-emailmktg__status-dot" data-status={c.status} />
                    {STATUS_LABEL[c.status]}
                  </div>
                </div>
              ))}
            </div>
            <div className="v2-emailmktg__editor">
              {!selected ? (
                <div className="v2-emailmktg__editor-empty">Select a campaign</div>
              ) : (
                <CampaignEditor
                  campaign={selected}
                  onUpdate={(patch) => data.updateCampaign(selected.id, patch)}
                  onSend={handleSend}
                  onDelete={() => data.deleteCampaign(selected.id)}
                  sendError={sendError}
                  sendSuccess={sendSuccess}
                  isGoogleConnected={data.isGoogleConnected}
                />
              )}
            </div>
          </div>
        )}

        {/* ── Leads tab ── */}
        {data.tab === "leads" && (
          <div className="v2-emailmktg__leads">
            {/* Scraper controls */}
            <div className="v2-emailmktg__scraper">
              <div className="v2-emailmktg__scraper-field">
                <span className="v2-emailmktg__scraper-label">Business Type</span>
                <input
                  className="v2-emailmktg__scraper-input"
                  value={scrapeQuery}
                  onChange={(e) => setScrapeQuery(e.target.value)}
                  placeholder="restaurant, salon, plumber…"
                />
              </div>
              <div className="v2-emailmktg__scraper-field">
                <span className="v2-emailmktg__scraper-label">Location</span>
                <input
                  className="v2-emailmktg__scraper-input"
                  value={scrapeLocation}
                  onChange={(e) => setScrapeLocation(e.target.value)}
                  placeholder="Miami, FL"
                />
              </div>
              <button
                className="v2-emailmktg__action-btn v2-emailmktg__action-btn--primary"
                disabled={data.scrapeJob.running || !scrapeLocation}
                onClick={() => data.scrapLeads(scrapeQuery, scrapeLocation)}
              >
                <Search size={12} />
                {data.scrapeJob.running ? "Scanning…" : "Find Leads"}
              </button>
              {data.scrapeJob.noWebsite > 0 && (
                <span className="v2-emailmktg__scrape-info">
                  {data.scrapeJob.noWebsite} without websites found
                </span>
              )}
            </div>

            {data.scrapeJob.error && (
              <div className="v2-emailmktg__error">{data.scrapeJob.error}</div>
            )}

            {/* Stats */}
            {data.leads.length > 0 && (
              <div className="v2-emailmktg__leads-stats">
                <div className="v2-emailmktg__leads-stat">
                  <strong>{data.leads.length}</strong> Total Leads
                </div>
                <div className="v2-emailmktg__leads-stat">
                  <strong>{data.leads.filter(l => !l.hasWebsite).length}</strong> No Website
                </div>
                <div className="v2-emailmktg__leads-stat">
                  <strong>{data.leads.filter(l => l.emailed).length}</strong> Emailed
                </div>
                <div className="v2-emailmktg__leads-stat">
                  <strong>{data.leads.filter(l => l.email).length}</strong> Have Email
                </div>
              </div>
            )}

            {/* Table */}
            <div className="v2-emailmktg__leads-table-wrap">
              {data.loadingLeads && <div className="v2-emailmktg__loading">Loading…</div>}
              {!data.loadingLeads && data.leads.length === 0 && (
                <div className="v2-emailmktg__loading">
                  No leads yet — search for businesses above to get started
                </div>
              )}
              {data.leads.length > 0 && (
                <table className="v2-emailmktg__leads-table">
                  <thead>
                    <tr>
                      <th>Business</th>
                      <th>Email</th>
                      <th>Phone</th>
                      <th>Category</th>
                      <th>Website</th>
                      <th>Emailed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.leads.map((lead) => (
                      <tr key={lead.id}>
                        <td title={lead.businessName}>{lead.businessName}</td>
                        <td>{lead.email ?? <span style={{ color: "var(--ink-3)" }}>—</span>}</td>
                        <td>{lead.phone ?? <span style={{ color: "var(--ink-3)" }}>—</span>}</td>
                        <td>{lead.category ?? <span style={{ color: "var(--ink-3)" }}>—</span>}</td>
                        <td>
                          {lead.hasWebsite ? (
                            <span style={{ color: "var(--ink-3)", fontSize: 11 }}>Has website</span>
                          ) : (
                            <span className="v2-emailmktg__no-web-badge">No website</span>
                          )}
                        </td>
                        <td>
                          {lead.emailed ? (
                            <span className="v2-emailmktg__emailed-badge">Sent</span>
                          ) : (
                            <span style={{ color: "var(--ink-3)", fontSize: 11 }}>—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>
    </RoomShell>
  );
}

/* ── Campaign editor sub-component ── */
function CampaignEditor({
  campaign,
  onUpdate,
  onSend,
  onDelete,
  sendError,
  sendSuccess,
  isGoogleConnected,
}: {
  campaign: EmailCampaign;
  onUpdate: (patch: Partial<EmailCampaign>) => void;
  onSend: () => void;
  onDelete: () => void;
  sendError: string | null;
  sendSuccess: string | null;
  isGoogleConnected: boolean;
}) {
  return (
    <>
      <div className="v2-emailmktg__field">
        <span className="v2-emailmktg__field-label">Campaign Name</span>
        <input
          className="v2-emailmktg__input"
          value={campaign.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          placeholder="Campaign name"
        />
      </div>

      <div className="v2-emailmktg__row">
        <div className="v2-emailmktg__field">
          <span className="v2-emailmktg__field-label">From Name</span>
          <input
            className="v2-emailmktg__input"
            value={campaign.fromName}
            onChange={(e) => onUpdate({ fromName: e.target.value })}
            placeholder="Built2Win Web"
          />
        </div>
        <div className="v2-emailmktg__field">
          <span className="v2-emailmktg__field-label">From Email</span>
          <input
            className="v2-emailmktg__input"
            value={campaign.fromEmail}
            onChange={(e) => onUpdate({ fromEmail: e.target.value })}
            placeholder="hr@built2winweb.com"
          />
        </div>
      </div>

      <div className="v2-emailmktg__field">
        <span className="v2-emailmktg__field-label">Subject Line</span>
        <input
          className="v2-emailmktg__input"
          value={campaign.subject}
          onChange={(e) => onUpdate({ subject: e.target.value })}
          placeholder="We noticed your business doesn't have a website…"
        />
      </div>

      <div className="v2-emailmktg__field">
        <span className="v2-emailmktg__field-label">
          Email Body — use {"{{business_name}}"} for personalization
        </span>
        <textarea
          className="v2-emailmktg__textarea"
          value={campaign.body}
          onChange={(e) => onUpdate({ body: e.target.value })}
          placeholder="Your email content here…"
          rows={12}
        />
      </div>

      {sendError && <div className="v2-emailmktg__error">{sendError}</div>}
      {sendSuccess && (
        <div style={{ color: "var(--ok)", fontSize: "var(--text-sm)", padding: "var(--s-2) 0" }}>
          ✓ {sendSuccess}
        </div>
      )}

      {!isGoogleConnected && (
        <div className="v2-emailmktg__error">
          Google not connected — sending requires Google authorization.{" "}
          <a href="#/_room_settings" style={{ color: "var(--warn)" }}>Connect in Settings →</a>
        </div>
      )}

      <div className="v2-emailmktg__editor-actions">
        <button
          className="v2-emailmktg__send-btn"
          onClick={onSend}
          disabled={
            !isGoogleConnected ||
            !campaign.subject.trim() ||
            !campaign.body.trim() ||
            campaign.status === "sending"
          }
        >
          <Send size={14} />
          {campaign.status === "sending" ? "Sending…" : "Send Campaign"}
        </button>
        <button
          className="v2-emailmktg__delete-btn"
          onClick={onDelete}
        >
          <Trash2 size={12} /> Delete
        </button>
      </div>
    </>
  );
}

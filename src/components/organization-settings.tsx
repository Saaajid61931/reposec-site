"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui";

export function OrganizationSettingsForm({
  organizationId,
  initialName,
  initialAgencyName,
  initialLogoUrl,
}: {
  organizationId: string;
  initialName: string;
  initialAgencyName: string;
  initialLogoUrl: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    const data = new FormData(event.currentTarget);
    const response = await fetch(`/api/organizations/${organizationId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: data.get("name"),
        agencyName: data.get("agencyName") || null,
        logoUrl: data.get("logoUrl") || null,
      }),
    });
    const result = (await response.json()) as { error?: string };
    setPending(false);
    setMessage(response.ok ? "Organization settings saved." : result.error ?? "Settings could not be saved.");
    if (response.ok) router.refresh();
  }

  return (
    <form onSubmit={submit}>
      <div className="field-group">
        <label htmlFor="organization-name">Workspace name</label>
        <input defaultValue={initialName} id="organization-name" maxLength={80} name="name" required />
      </div>
      <div className="field-group">
        <label htmlFor="agency-name">Agency name in reports <span>Agency plan</span></label>
        <input defaultValue={initialAgencyName} id="agency-name" maxLength={100} name="agencyName" />
      </div>
      <div className="field-group">
        <label htmlFor="logo-url">Agency logo URL <span>Agency plan</span></label>
        <input defaultValue={initialLogoUrl} id="logo-url" name="logoUrl" placeholder="https://…" type="url" />
      </div>
      <Button disabled={pending} type="submit">{pending ? "Saving…" : "Save settings"}</Button>
      {message && <p className="inline-note" role="status">{message}</p>}
    </form>
  );
}

export function InviteMemberForm({ organizationId }: { organizationId: string }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    const form = event.currentTarget;
    const data = new FormData(form);
    const response = await fetch(`/api/organizations/${organizationId}/members`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: data.get("email"), role: data.get("role") }),
    });
    const result = (await response.json()) as { error?: string };
    setPending(false);
    setMessage(response.ok ? "Invitation email queued." : result.error ?? "Invitation could not be created.");
    if (response.ok) form.reset();
  }

  return (
    <form className="member-invite-form" onSubmit={submit}>
      <div className="field-group">
        <label htmlFor="invite-email">Email</label>
        <input id="invite-email" name="email" placeholder="colleague@example.com" type="email" required />
      </div>
      <div className="field-group">
        <label htmlFor="invite-role">Role</label>
        <select defaultValue="member" id="invite-role" name="role">
          <option value="member">Member</option>
          <option value="viewer">Viewer</option>
          <option value="admin">Admin</option>
        </select>
      </div>
      <Button disabled={pending} type="submit">{pending ? "Inviting…" : "Invite member"}</Button>
      {message && <p className="inline-note" role="status">{message}</p>}
    </form>
  );
}

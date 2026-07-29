"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui";

export function ContactForm() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    const form = event.currentTarget;
    const data = new FormData(form);
    const response = await fetch("/api/contact", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: data.get("name"),
        email: data.get("email"),
        topic: data.get("topic"),
        message: data.get("message"),
        website: data.get("website"),
      }),
    });
    const result = (await response.json()) as { error?: string };
    setPending(false);
    setMessage(response.ok ? "Message received. We’ll reply by email." : result.error ?? "Message could not be sent.");
    if (response.ok) form.reset();
  }

  return (
    <form className="contact-form" onSubmit={submit}>
      <div className="field-group"><label htmlFor="contact-name">Name</label><input id="contact-name" maxLength={100} name="name" required /></div>
      <div className="field-group"><label htmlFor="contact-email">Email</label><input id="contact-email" name="email" type="email" required /></div>
      <div className="field-group">
        <label htmlFor="contact-topic">Topic</label>
        <select id="contact-topic" name="topic" defaultValue="product">
          <option value="product">Product question</option>
          <option value="billing">Billing</option>
          <option value="privacy">Privacy or deletion</option>
          <option value="security">Security disclosure</option>
        </select>
      </div>
      <div className="field-group"><label htmlFor="contact-message">Message</label><textarea id="contact-message" maxLength={5000} name="message" required /></div>
      <div aria-hidden="true" style={{ position: "absolute", left: -10000 }}><label htmlFor="contact-website">Website</label><input autoComplete="off" id="contact-website" name="website" tabIndex={-1} /></div>
      <Button disabled={pending} type="submit">{pending ? "Sending…" : "Send message"}</Button>
      {message && <p className="inline-note" role="status">{message}</p>}
    </form>
  );
}

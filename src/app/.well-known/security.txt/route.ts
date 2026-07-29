export const revalidate = 86400;

export function GET() {
  const expires = new Date();
  expires.setUTCFullYear(expires.getUTCFullYear() + 1);

  const body = [
    "Contact: mailto:security@reposec.site",
    "Preferred-Languages: en",
    `Expires: ${expires.toISOString()}`,
    "Canonical: https://reposec.site/.well-known/security.txt",
    "Policy: https://reposec.site/security",
    "Acknowledgments: https://reposec.site/security",
  ].join("\n");

  return new Response(`${body}\n`, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=86400",
    },
  });
}

export async function getCsrfSession(baseUrl, pagePath = "/login") {
  const response = await fetch(`${baseUrl}${pagePath}`, {
    headers: { accept: "text/html" },
  });
  const html = await response.text();
  const setCookie = response.headers.get("set-cookie");
  const cookie = setCookie ? setCookie.split(";")[0] : null;
  const match = html.match(/name="_csrf"\s+value="([a-f0-9]{64})"/);
  const csrfToken = match ? match[1] : "";
  return { cookie, csrfToken, html, response };
}

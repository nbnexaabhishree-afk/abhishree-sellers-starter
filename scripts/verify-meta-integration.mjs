import assert from "node:assert/strict";
import https from "node:https";

const apiVersion = process.env.WHATSAPP_API_VERSION;
const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
assert(apiVersion && phoneNumberId && accessToken, "Legacy WhatsApp environment credentials are required");

const endpoint = new URL(`https://graph.facebook.com/${apiVersion}/${encodeURIComponent(phoneNumberId)}`);
endpoint.searchParams.set("fields", "id,display_phone_number,verified_name,quality_rating");
endpoint.searchParams.set("access_token", accessToken);

const { status, body } = await new Promise((resolve, reject) => {
  https.get(endpoint, (response) => {
    let raw = "";
    response.setEncoding("utf8");
    response.on("data", (chunk) => { raw += chunk; });
    response.on("end", () => {
      try {
        resolve({ status: response.statusCode ?? 500, body: JSON.parse(raw) });
      } catch (error) {
        reject(error);
      }
    });
  }).on("error", reject);
});
if (status < 200 || status >= 300) {
  console.error(`FAIL Meta credential validation (${body.error?.type ?? "unknown"}, code ${body.error?.code ?? "unknown"})`);
  console.error(body.error?.message ?? "Meta returned an unknown error");
  process.exitCode = 1;
} else {
  console.log("PASS Meta access token and phone-number access");
  console.log(`Business display name: ${body.verified_name ?? "not returned"}`);
  console.log(`Quality rating: ${body.quality_rating ?? "not returned"}`);
}

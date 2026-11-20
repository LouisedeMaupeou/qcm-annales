import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const cle = env.SUPABASE_SERVICE_ROLE_KEY;

const req = async (chemin) => {
  const r = await fetch(`${url}/rest/v1/${chemin}`, {
    headers: { apikey: cle, Authorization: `Bearer ${cle}` },
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
};

const concours = await req("concours?select=id,nom&nom=ilike.*SAME*");
console.log("concours :", concours.map((c) => `${c.nom} (${c.id})`).join(", "));
for (const c of concours) {
  const eps = await req(
    `epreuves?select=id,nom,visible_public&concours_id=eq.${c.id}&order=nom`,
  );
  for (const e of eps) {
    console.log(
      `  ${e.nom.padEnd(38)} ${e.visible_public ? "public" : "masquée"}`,
    );
  }
}

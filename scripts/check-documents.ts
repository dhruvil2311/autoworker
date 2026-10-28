import "dotenv/config";
import { Client } from "pg";
async function run() {
  const client = new Client({ connectionString: "postgresql://postgres:postgres@127.0.0.1:54322/postgres" });
  await client.connect();
  const res = await client.query("SELECT to_regclass('public.documents') as exists;");
  console.log("Documents table exists:", res.rows[0]);
  const res2 = await client.query("SELECT * FROM public.documents;");
  console.log("Documents query:", res2.rows);
  await client.end();
}
run();

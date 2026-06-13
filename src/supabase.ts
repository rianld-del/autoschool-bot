import dotenv from "dotenv"
dotenv.config()

import { createClient } from "@supabase/supabase-js"

export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_KEY!
)

console.log("URL:", process.env.SUPABASE_URL)
console.log("KEY:", process.env.SUPABASE_KEY)
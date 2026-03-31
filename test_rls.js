import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const envFile = fs.readFileSync('.env', 'utf-8').split('\n')
const env = {}
envFile.forEach(line => {
  if (line.includes('=')) {
    const [key, val] = line.split('=')
    env[key.trim()] = val.trim()
  }
})

const supabaseUrl = env['VITE_SUPABASE_URL']
const supabaseKey = env['VITE_SUPABASE_ANON_KEY']
const supabase = createClient(supabaseUrl, supabaseKey)

async function test() {
  console.log("Testing professionals...")
  const res1 = await supabase.from('professionals').select('*').limit(1)
  console.log('Professionals:', res1.error ? res1.error.message : 'OK')

  console.log("Testing patients...")
  const res2 = await supabase.from('patients').select('*').limit(1)
  console.log('Patients:', res2.error ? res2.error.message : 'OK')

  console.log("Testing professional_schedules...")
  const res3 = await supabase.from('professional_schedules').select('*').limit(1)
  console.log('Schedules:', res3.error ? res3.error.message : 'OK')

  console.log("Testing cuponeras...")
  const res4 = await supabase.from('cuponeras').select('*').limit(1)
  console.log('Cuponeras:', res4.error ? res4.error.message : 'OK')
}
test()

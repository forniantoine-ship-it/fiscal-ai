import { supabase } from './supabase'

export async function testInsertDossier() {
  const { data, error } = await supabase
    .from('lmnp_dossiers')
    .insert([
      {
        status: 'draft',
        city: 'Bordeaux',
        lmnp_type: 'réel',
      },
    ])
    .select()

  console.log('DATA:', data)
  console.log('ERROR:', error)
}
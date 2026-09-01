import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

export function useRealtimeStaff() {
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    async function load() {
      const { data, error } = await supabase.from('staff').select('*')
      if (!mounted) return
      if (error) console.error('load staff error:', error)
      setStaff(data ?? [])
      setLoading(false)
    }

    load()

    const channel = supabase
      .channel('staff-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'staff' },
        () => load()
      )
      .subscribe()

    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
  }, [])

  return { staff, loading }
}
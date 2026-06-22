'use client';

import { useEffect, useRef, useState } from 'react';

function idSequence(id) {
  const match = String(id || '').match(/AUD-(\d+)/);
  return match ? Number(match[1]) : 0;
}

function sortAuditNewestFirst(entries) {
  return entries.slice().sort((a, b) => idSequence(b.id) - idSequence(a.id));
}

export function useAuditStream({ sinceId, runId }) {
  const [audit, setAudit] = useState([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);
  const esRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const latestIdRef = useRef(sinceId);

  useEffect(() => {
    let cancelled = false;
    setConnected(false);
    setError(null);
    setAudit([]);

    function connect() {
      if (typeof window === 'undefined') return;
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }

      const url = new URL('/api/events', window.location.origin);
      if (latestIdRef.current) {
        url.searchParams.set('sinceId', latestIdRef.current);
      }
      if (runId) {
        url.searchParams.set('runId', runId);
      }

      const es = new EventSource(url.toString());
      esRef.current = es;

      es.onopen = () => {
        if (cancelled) return;
        setConnected(true);
        setError(null);
      };

      es.addEventListener('audit', (event) => {
        if (cancelled) return;
        try {
          const entry = JSON.parse(event.data);
          latestIdRef.current = entry.id;
          setAudit((prev) => {
            const next = [entry, ...prev.filter((e) => e.id !== entry.id)];
            return sortAuditNewestFirst(next);
          });
        } catch (err) {
          setError(String(err));
        }
      });

      es.onerror = () => {
        if (cancelled) return;
        setConnected(false);
        es.close();
        esRef.current = null;
        reconnectTimeoutRef.current = setTimeout(connect, 3000);
      };
    }

    latestIdRef.current = sinceId;
    connect();

    return () => {
      cancelled = true;
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [runId, sinceId]);

  return { audit, connected, error };
}

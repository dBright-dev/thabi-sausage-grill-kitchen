'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/utils/supabase/client';
import {
  Search,
  Clock,
  Flame,
  Utensils,
  AlertTriangle,
} from 'lucide-react';

interface OrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  notes?: string;
  size?: string;
}

interface OrderTicket {
  id: string;
  short_code?: string;
  created_at: string;
  customer_name: string;
  status: 'RECEIVED' | 'PREPARING' | 'READY' | 'COMPLETED';
  items: OrderItem[];
  total_price: number;
  pickup_time?: string;
  special_instructions?: string;
}

// ── KDS Status Configurations ──────────────────────────────────────
const KDS_STATUS = {
  RECEIVED: {
    label: 'New Order',
    headerBg: 'bg-[#8E8E93]',       // Slate Gray
    buttonBg: 'bg-[#8E8E93] hover:bg-[#7C7C80]',
    actionLabel: 'Start Cooking',
  },
  PREPARING: {
    label: 'Cooking',
    headerBg: 'bg-[#F59E0B]',       // Kitchen Orange
    buttonBg: 'bg-[#F59E0B] hover:bg-[#D97706]',
    actionLabel: 'Mark Ready',
  },
  READY: {
    label: 'Finished',
    headerBg: 'bg-[#10B981]',       // Fresh Green
    buttonBg: 'bg-[#10B981] hover:bg-[#059669]',
    actionLabel: 'Serve Order',
  },
} as const;

type ActiveKDSStatus = keyof typeof KDS_STATUS;

const DELAYED_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

export default function KitchenDashboard() {
  const [tickets, setTickets] = useState<OrderTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'ALL' | ActiveKDSStatus>('ALL');
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const fetchActiveTickets = async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .neq('status', 'COMPLETED')
        .order('created_at', { ascending: true });

      if (error) {
        throw error;
      }
      setTickets(data || []);
    } catch (err) {
      console.error('Database fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActiveTickets();

    const kitchenChannel = supabase
      .channel('kds-live-pipeline')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        fetchActiveTickets();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(kitchenChannel);
    };
  }, []);

  const moveTicketStatus = async (ticketId: string, currentStatus: OrderTicket['status']) => {
    let nextStatus: OrderTicket['status'] = 'PREPARING';
    if (currentStatus === 'PREPARING') {
      nextStatus = 'READY';
    } else if (currentStatus === 'READY') {
      nextStatus = 'COMPLETED';
    }

    try {
      setTickets(prev =>
        nextStatus === 'COMPLETED'
          ? prev.filter(t => t.id !== ticketId)
          : prev.map(t => (t.id === ticketId ? { ...t, status: nextStatus } : t))
      );
      await supabase.from('orders').update({ status: nextStatus }).eq('id', ticketId);
    } catch (err) {
      console.error('Error updating order status:', err);
      fetchActiveTickets();
    }
  };

  const getToken = (t: OrderTicket) => t.short_code || t.id.slice(0, 6).toUpperCase();

  const filteredTickets = tickets.filter(ticket => {
    const matchesSearch =
      ticket.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      getToken(ticket).toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.customer_name?.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;
    if (activeTab === 'ALL') return true;
    return ticket.status === activeTab;
  });

  const getTicketsByStatus = (status: ActiveKDSStatus) =>
    filteredTickets.filter(t => t.status === status);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#121316]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" />
      </div>
    );
  }

  const columns: ActiveKDSStatus[] = ['RECEIVED', 'PREPARING', 'READY'];

  return (
    <div className="min-h-screen bg-[#121316] font-sans antialiased text-zinc-100 flex flex-col">
      {/* ── Top KDS Bar ──────────────────────────────────────────────────── */}
      <header className="bg-[#1C1D22] border-b border-zinc-800 px-6 py-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/10">
              <Flame size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-base font-extrabold tracking-tight text-white flex items-center gap-2">
                Thabi&apos;s Sausage &amp; Grill
                <span className="text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30 font-mono px-2 py-0.5 rounded font-bold">
                  KDS V2
                </span>
              </h1>
              <p className="text-xs text-zinc-400 font-medium">Live Kitchen Order Management</p>
            </div>
          </div>

          {/* Color Legend Indicators */}
          <div className="hidden lg:flex items-center gap-6 bg-[#121316] px-4 py-2 rounded-xl border border-zinc-800">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Status Colors:</span>
            <div className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 rounded-full bg-[#8E8E93]" />
              <span className="text-xs font-bold text-zinc-300">New Order</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 rounded-full bg-[#F59E0B]" />
              <span className="text-xs font-bold text-zinc-300">Cooking</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 rounded-full bg-[#10B981]" />
              <span className="text-xs font-bold text-zinc-300">Finished</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 rounded-full bg-[#EF4444]" />
              <span className="text-xs font-bold text-zinc-300">Overdue (&gt;10m)</span>
            </div>
          </div>

          {/* Search Bar */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={14} />
              <input
                type="text"
                placeholder="Search ticket # or name..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-[#121316] border border-zinc-800 text-zinc-100 placeholder:text-zinc-600 rounded-xl pl-9 pr-3 py-2 text-xs font-medium focus:outline-none focus:border-amber-500 transition-all font-mono"
              />
            </div>
          </div>

        </div>
      </header>

      {/* ── Main KDS Pipeline Columns ────────────────────────────────────── */}
      <main className="p-6 flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {columns.map(status => {
          const config = KDS_STATUS[status];
          const ticketsInColumn = getTicketsByStatus(status);

          return (
            <section key={status} className="bg-[#1C1D22] rounded-2xl border border-zinc-800 p-4 flex flex-col gap-4">
              
              {/* Column Title */}
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                <div className="flex items-center gap-2.5">
                  <span className={`w-3 h-3 rounded-full ${config.headerBg}`} />
                  <h2 className="text-sm font-extrabold text-white tracking-wide uppercase">
                    {config.label}
                  </h2>
                </div>
                <span className="text-xs font-mono font-black px-2.5 py-1 rounded-lg bg-zinc-800 text-zinc-300 border border-zinc-700/50">
                  {ticketsInColumn.length}
                </span>
              </div>

              {/* Ticket Cards */}
              <div className="space-y-4">
                {ticketsInColumn.length === 0 && (
                  <div className="rounded-xl border border-dashed border-zinc-800 py-16 text-center">
                    <Utensils size={24} className="mx-auto text-zinc-600 mb-2" />
                    <p className="text-xs text-zinc-500 font-bold uppercase tracking-wider">No active tickets</p>
                  </div>
                )}

                {ticketsInColumn.map(order => (
                  <KDSTicketCard
                    key={order.id}
                    order={order}
                    token={getToken(order)}
                    now={now}
                    onAction={() => moveTicketStatus(order.id, order.status)}
                  />
                ))}
              </div>

            </section>
          );
        })}
      </main>
    </div>
  );
}

function formatElapsed(createdAt: string, now: number): { text: string; isDelayed: boolean } {
  const diffMs = now - new Date(createdAt).getTime();
  const totalSeconds = Math.max(0, Math.floor(diffMs / 1000));
  const mm = Math.floor(totalSeconds / 60);
  const ss = totalSeconds % 60;
  const text = `${mm}m ${ss.toString().padStart(2, '0')}s`;
  return { text, isDelayed: diffMs > DELAYED_THRESHOLD_MS };
}

interface KDSCardProps {
  order: OrderTicket;
  token: string;
  now: number;
  onAction: () => void;
}

function KDSTicketCard({ order, token, now, onAction }: KDSCardProps) {
  const { text: elapsedText, isDelayed } = formatElapsed(order.created_at, now);

  // Safely cast order status to an active KDS status key (fallback to RECEIVED)
  const activeStatus = (order.status in KDS_STATUS ? order.status : 'RECEIVED') as ActiveKDSStatus;
  const theme = KDS_STATUS[activeStatus];

  // Dynamic header styling: Turns red if overdue, otherwise uses standard status color
  const headerBgClass = isDelayed && activeStatus !== 'READY' ? 'bg-[#EF4444]' : theme.headerBg;

  return (
    <div className="rounded-xl overflow-hidden bg-white text-zinc-900 shadow-md border border-zinc-300 flex flex-col">
      
      {/* 1. Header Banner */}
      <div className={`${headerBgClass} px-3.5 py-2 text-white flex items-center justify-between font-mono text-xs font-bold transition-colors`}>
        <div className="flex items-center gap-2">
          <span className="bg-black/20 px-1.5 py-0.5 rounded text-[11px]">
            #{token}
          </span>
          <span className="truncate max-w-[110px] font-sans font-extrabold">
            Walk-In | {order.customer_name}
          </span>
        </div>

        <div className={`flex items-center gap-1 bg-black/20 px-2 py-0.5 rounded text-[11px] ${isDelayed ? 'animate-pulse font-black' : ''}`}>
          <Clock size={12} />
          {elapsedText}
        </div>
      </div>

      {/* 2. Ticket Interior Content */}
      <div className="p-3.5 flex-1 bg-[#F8FAFC]">
        
        {/* Order Sub-header */}
        <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-2 pb-1 border-b border-zinc-200">
          Order Items
        </div>

        <ul className="space-y-2 mb-3">
          {order.items?.map((item, idx) => (
            <li key={idx} className="text-xs">
              <div className="flex items-start justify-between font-bold text-zinc-900">
                <span className="flex-1 pr-2">{item.name}</span>
                <span className="font-mono bg-zinc-200 px-1.5 py-0.5 rounded text-[11px]">
                  x{item.quantity}
                </span>
              </div>
              {item.notes && (
                <p className="text-[10.5px] text-sky-700 font-semibold mt-0.5 pl-2 border-l-2 border-sky-400">
                  {item.notes}
                </p>
              )}
            </li>
          ))}
        </ul>

        {/* Special Instructions */}
        {order.special_instructions && (
          <div className="mb-3 p-2 bg-amber-50 border border-amber-200 rounded text-[11px] font-semibold text-amber-900 flex items-start gap-1.5">
            <AlertTriangle size={13} className="text-amber-600 shrink-0 mt-0.5" />
            <span>{order.special_instructions}</span>
          </div>
        )}

        {/* Total Price */}
        <div className="pt-2 border-t border-zinc-200 flex items-center justify-between text-xs font-extrabold text-zinc-700">
          <span>Total:</span>
          <span className="font-mono text-zinc-900">R{order.total_price?.toFixed(2)}</span>
        </div>
      </div>

      {/* 3. Action Button Banner */}
      <button
        onClick={onAction}
        className={`w-full py-2.5 ${theme.buttonBg} text-white font-extrabold text-xs tracking-wider uppercase shadow-inner transition-colors`}
      >
        {theme.actionLabel}
      </button>

    </div>
  );
}
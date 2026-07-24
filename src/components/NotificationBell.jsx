import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, BellPlus, BellOff } from 'lucide-react';
import { db } from '@/api/db';
import { isPushSupported, getPushStatus, subscribeToPush, unsubscribeFromPush } from '@/lib/pushNotifications';

function timeAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function NotificationBell({ userId, iconClassName = 'text-slate-400 hover:text-white', buttonClassName = 'hover:bg-slate-800', align = 'right' }) {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const [pushStatus, setPushStatus] = useState('unsupported');
  const [pushBusy, setPushBusy] = useState(false);
  const containerRef = useRef(null);

  const load = useCallback(() => {
    if (!userId) return;
    db.entities.Notification.filter({ recipient_id: userId }, '-created_date', 50)
      .then(setNotifications)
      .catch(() => {});
  }, [userId]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    load();
    getPushStatus().then(setPushStatus).catch(() => {});
    const onClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open, load]);

  const togglePush = async () => {
    setPushBusy(true);
    try {
      if (pushStatus === 'subscribed') {
        await unsubscribeFromPush();
        setPushStatus('unsubscribed');
      } else {
        await subscribeToPush(userId);
        setPushStatus('subscribed');
      }
    } catch (e) {
      setPushStatus(await getPushStatus().catch(() => 'unsubscribed'));
      if (e.message !== 'Notification permission was not granted') alert(e.message);
    } finally {
      setPushBusy(false);
    }
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const handleClick = async (n) => {
    if (!n.is_read) {
      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x));
      db.entities.Notification.update(n.id, { is_read: true }).catch(() => {});
    }
    setOpen(false);
    if (n.session_id) navigate(`/sessions/${n.session_id}/edit`);
  };

  const markAllRead = () => {
    const unread = notifications.filter(n => !n.is_read);
    if (unread.length === 0) return;
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    Promise.all(unread.map(n => db.entities.Notification.update(n.id, { is_read: true }).catch(() => {})));
  };

  if (!userId) return null;

  return (
    <div className="relative" ref={containerRef}>
      <button onClick={() => setOpen(v => !v)} className={`relative p-1.5 rounded-lg transition-colors ${iconClassName} ${buttonClassName}`}>
        <Bell size={19} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className={`absolute ${align === 'left' ? 'left-0' : 'right-0'} top-full mt-1 w-72 max-w-[calc(100vw-2rem)] bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden`}>
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
            <p className="text-sm font-bold text-slate-900">Notifications</p>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-xs font-semibold text-blue-600 hover:text-blue-800">Mark all read</button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">No notifications yet</p>
            ) : (
              notifications.map(n => (
                <button key={n.id} onClick={() => handleClick(n)}
                  className={`w-full text-left px-3 py-2.5 border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors ${!n.is_read ? 'bg-blue-50/50' : ''}`}>
                  <div className="flex items-start gap-2">
                    {!n.is_read && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs ${!n.is_read ? 'text-slate-900 font-semibold' : 'text-slate-500'}`}>{n.message}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{timeAgo(n.created_at)}</p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
          {isPushSupported() && pushStatus !== 'denied' && (
            <div className="border-t border-slate-100 px-3 py-2">
              <button onClick={togglePush} disabled={pushBusy}
                className="w-full flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-800 disabled:opacity-50 py-1">
                {pushStatus === 'subscribed' ? <BellOff size={13} /> : <BellPlus size={13} />}
                {pushBusy
                  ? 'Working…'
                  : pushStatus === 'subscribed'
                    ? 'Turn off push notifications'
                    : 'Get push notifications on this device'}
              </button>
            </div>
          )}
          {isPushSupported() && pushStatus === 'denied' && (
            <div className="border-t border-slate-100 px-3 py-2">
              <p className="text-xs text-slate-400">
                Push notifications are blocked for CoachPad in your browser settings.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

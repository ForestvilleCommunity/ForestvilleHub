import { useState, useEffect } from 'react';
import { X, Lightbulb } from 'lucide-react';

export default function HelpBubble({ id, text }) {
  const key = `cp_help_${id}`;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(key)) setVisible(true);
  }, []);

  if (!visible) return null;

  return (
    <div className="mx-4 mb-3 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5 flex items-start gap-2.5">
      <Lightbulb size={14} className="text-blue-500 shrink-0 mt-0.5" />
      <p className="text-xs text-blue-700 flex-1 leading-relaxed">{text}</p>
      <button
        onClick={() => { localStorage.setItem(key, '1'); setVisible(false); }}
        className="text-blue-300 hover:text-blue-500 shrink-0 ml-1 transition-colors">
        <X size={13} />
      </button>
    </div>
  );
}
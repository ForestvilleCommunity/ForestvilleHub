import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Save, Check, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/api/db';
import { useWhiteboardState } from '@/components/whiteboard/useWhiteboardState';
import WhiteboardCanvas from '@/components/whiteboard/WhiteboardCanvas';
import DrillToolbar from '@/components/whiteboard/DrillToolbar';
import RightToolsPanel from '@/components/whiteboard/RightToolsPanel';
import DrillDetailsForm from '@/components/drills/DrillDetailsForm';

function parseExtraImages(str) {
  if (!str) return [];
  try { return JSON.parse(str); } catch { return []; }
}

const DEFAULT_FORM = {
  name: '', item_type: 'Drill', theme: '', play_category: '',
  skill_focus: '', age_group: '', level: null, players_needed: '', duration_minutes: '',
  equipment: '', description: '', coaching_points: '', progressions: '', regressions: '',
  competitive: false, coach_notes: '', tags: '', formation: '', trigger: '',
  primary_objective: '', secondary_option: '', counter: '', video_url: '',
  images: [], // up to 6 diagram images
};

function validate(form) {
  const errors = {};
  if (!form.name?.trim()) errors.name = 'Name is required';
  if (!form.item_type) errors.item_type = 'Type is required';
  if (form.item_type === 'Drill' && !form.theme) errors.theme = 'Theme is required';
  if (form.item_type === 'Play' && !form.play_category) errors.play_category = 'Play theme is required';
  return errors;
}

export default function DrillBuilder() {
  const { drillId } = useParams();
  const navigate = useNavigate();
  const isEdit = !!drillId;

  const [user, setUser] = useState(null);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const saveRef = useRef(false);
  const [loading, setLoading] = useState(isEdit);
  const [step, setStep] = useState(1);
  const [selectedTool, setSelectedTool] = useState(null);
  const [showMobileTools, setShowMobileTools] = useState(false);

  const [uploadingImage, setUploadingImage] = useState(false);

  const wb = useWhiteboardState(null);
  const initialFormRef = useRef(JSON.stringify(DEFAULT_FORM));
  const justSavedRef = useRef(false);

  useEffect(() => {
    db.auth.me().then(setUser).catch(() => {});
    if (isEdit) loadDrill();
  }, []);

  const isDirty = () => JSON.stringify(form) !== initialFormRef.current || wb.canUndo;

  useEffect(() => {
    const handler = (e) => {
      if (justSavedRef.current || !isDirty()) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  });

  const handleLeave = () => {
    if (isDirty() && !window.confirm('You have unsaved changes to this drill. Leave without saving?')) return;
    navigate('/drills');
  };

  const loadDrill = async () => {
    const drill = await db.entities.Drill.get(drillId);
    const loaded = {
      name: drill.name || '', item_type: drill.item_type || 'Drill',
      theme: drill.theme || '', play_category: drill.play_category || '',
      skill_focus: drill.skill_focus || '', age_group: drill.age_group || '',
      level: drill.level || null, players_needed: drill.players_needed || '',
      duration_minutes: drill.duration_minutes || '', equipment: drill.equipment || '',
      description: drill.description || '', coaching_points: drill.coaching_points || '',
      progressions: drill.progressions || '', regressions: drill.regressions || '',
      competitive: drill.competitive || false, coach_notes: drill.coach_notes || '',
      tags: drill.tags || '', formation: drill.formation || '', trigger: drill.trigger || '',
      primary_objective: drill.primary_objective || '', secondary_option: drill.secondary_option || '',
      counter: drill.counter || '', video_url: drill.video_url || '',
      images: [drill.image_url, ...parseExtraImages(drill.extra_images)].filter(Boolean),
    };
    setForm(loaded);
    initialFormRef.current = JSON.stringify(loaded);
    if (drill.drawing_data) wb.reinit(drill.drawing_data);
    setLoading(false);
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (form.images.length >= 6) { toast.error('Maximum 6 images allowed'); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error('Image must be under 10 MB'); return; }
    setUploadingImage(true);
    const { file_url } = await db.integrations.Core.UploadFile({ file });
    setForm(f => ({ ...f, images: [...f.images, file_url] }));
    setUploadingImage(false);
    toast.success('Image uploaded');
  };

  const removeImage = (index) => {
    setForm(f => ({ ...f, images: f.images.filter((_, i) => i !== index) }));
  };

  const setPrimaryImage = (index) => {
    setForm(f => {
      const imgs = [...f.images];
      const [img] = imgs.splice(index, 1);
      return { ...f, images: [img, ...imgs] };
    });
  };

  const handleNextStep = () => {
    const errs = validate(form);
    if (Object.keys(errs).length) { setErrors(errs); toast.error('Please complete required fields.'); return; }
    setErrors({});
    setStep(2);
  };

  const handleSave = async () => {
    if (saveRef.current) return;
    saveRef.current = true;
    const errs = validate(form);
    if (Object.keys(errs).length) {
      saveRef.current = false;
      setErrors(errs); setStep(1); toast.error('Please complete required fields.'); return;
    }
    setSaving(true);
    try {
      const drawingData = wb.getDrawingData();
      const { images, ...restForm } = form;
      const payload = {
        ...restForm,
        image_url: images[0] || '',
        extra_images: images.length > 1 ? JSON.stringify(images.slice(1)) : '',
        level: restForm.level ? Number(restForm.level) : undefined,
        duration_minutes: restForm.duration_minutes ? Number(restForm.duration_minutes) : undefined,
        drawing_data: drawingData,
        owner_user_email: user?.email,
        owner_id: user?.id,
      };
      if (isEdit) {
        await db.entities.Drill.update(drillId, payload);
        toast.success('Drill saved!');
      } else {
        await db.entities.Drill.create(payload);
        toast.success('Drill created!');
      }
      saveRef.current = false;
      justSavedRef.current = true;
      navigate('/drills');
    } catch (e) {
      toast.error('Error saving drill: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="fixed inset-0 flex items-center justify-center bg-slate-900">
      <div className="w-8 h-8 border-4 border-slate-700 border-t-orange-500 rounded-full animate-spin" />
    </div>
  );

  // STEP 1: DETAILS
  if (step === 1) {
    return (
      <div className="fixed inset-0 flex flex-col bg-slate-50" style={{ zIndex: 100 }}>
        <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3 shrink-0">
          <button onClick={handleLeave} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-slate-900 text-base truncate">{form.name || `New ${form.item_type}`}</h1>
            <p className="text-xs text-slate-400">Step 1 of 2 · Details</p>
          </div>
          <div className="flex gap-1 shrink-0">
            <div className="w-8 h-1.5 rounded-full bg-orange-500" />
            <div className="w-8 h-1.5 rounded-full bg-slate-200" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="max-w-xl mx-auto">
            <DrillDetailsForm form={form} setForm={setForm} errors={errors} />
            <div className="px-4 pb-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  Diagrams <span className="text-slate-400 font-normal">(up to 6 — swipe order)</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {form.images.map((url, i) => (
                    <div key={i} className="relative rounded-xl overflow-hidden bg-slate-100" style={{ aspectRatio: '1' }}>
                      <img src={url} alt="" className="w-full h-full object-cover" />
                      <button onClick={() => removeImage(i)}
                        className="absolute top-1 right-1 w-6 h-6 bg-white/90 rounded-lg flex items-center justify-center text-slate-500 hover:text-red-500 text-xs font-bold shadow">
                        ✕
                      </button>
                      {i === 0 ? (
                        <span className="absolute bottom-1 left-1 text-xs bg-black/60 text-white px-1.5 py-0.5 rounded-md leading-none">Primary</span>
                      ) : (
                        <button
                          onClick={() => setPrimaryImage(i)}
                          className="absolute bottom-1 left-1 text-xs bg-blue-600 text-white px-1.5 py-0.5 rounded-md leading-none hover:bg-blue-700 transition-colors"
                        >
                          Set 1st
                        </button>
                      )}
                    </div>
                  ))}
                  {form.images.length < 6 && (
                    <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-xl cursor-pointer hover:border-orange-400 hover:bg-orange-50 transition-colors" style={{ aspectRatio: '1' }}>
                      <span className="text-xl mb-0.5">📷</span>
                      <span className="text-xs text-slate-500 text-center px-1">
                        {uploadingImage ? 'Uploading…' : 'Add image'}
                      </span>
                      <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploadingImage} />
                    </label>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white border-t border-slate-200 px-4 py-3 flex gap-3 shrink-0">
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-3 rounded-xl border border-slate-200 text-slate-700 font-semibold text-sm flex items-center gap-1.5 hover:bg-slate-50 disabled:opacity-60">
            <Save size={15} />{saving ? 'Saving...' : 'Save & Exit'}
          </button>
          <button onClick={handleNextStep}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-semibold text-sm transition-colors shadow-md shadow-orange-200">
            Next: Draw <ArrowRight size={16} />
          </button>
        </div>
      </div>
    );
  }

  // STEP 2: WHITEBOARD (full drawing mode — no details panel)
  return (
    <div className="fixed inset-0 flex flex-col bg-slate-900" style={{ zIndex: 100 }}>
      {/* Top bar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-950 border-b border-slate-800 shrink-0">
        <button onClick={() => setStep(1)} className="p-1.5 text-slate-400 hover:text-white rounded-lg">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-sm truncate">{form.name || 'Untitled'}</p>
          <p className="text-slate-400 text-xs">Step 2 of 2 · Draw (optional)</p>
        </div>
        <div className="flex gap-1 mr-2">
          <div className="w-8 h-1.5 rounded-full bg-orange-500 opacity-50" />
          <div className="w-8 h-1.5 rounded-full bg-orange-500" />
        </div>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 active:scale-95 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-all shrink-0 shadow-md shadow-orange-900/30">
          <Save size={15} />{saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      {/* Toolbar — hide on mobile when tools panel is open to save space */}
      <div className={showMobileTools ? 'hidden md:block' : ''}>
        <DrillToolbar wb={wb} selectedTool={selectedTool} onToolSelect={setSelectedTool} />
      </div>

      {/* Main area — court + right tools only */}
      <div className="flex flex-1 overflow-hidden">
        {/* Court */}
        <div className="flex-1 overflow-hidden bg-slate-800 flex items-center justify-center p-2 md:p-4 relative">
          <div className="w-full h-full max-w-4xl">
            <WhiteboardCanvas wb={wb} selectedTool={selectedTool} onToolDone={() => setSelectedTool(null)} />
          </div>
        </div>

        {/* Right Panel — md+ */}
        <div className="hidden md:flex flex-col w-52 shrink-0 overflow-hidden">
          <div className="px-3 pt-3 pb-1 bg-slate-800 border-b border-slate-700">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Tools</p>
          </div>
          <div className="flex-1 overflow-hidden">
            <RightToolsPanel selectedTool={selectedTool} onToolSelect={setSelectedTool} />
          </div>
        </div>
      </div>

      {/* Mobile: tools toggle */}
      <div className="md:hidden shrink-0 bg-slate-950 border-t border-slate-800">
        <div className="flex">
          <button onClick={() => setShowMobileTools(!showMobileTools)}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-semibold transition-colors ${showMobileTools ? 'bg-slate-800 text-white' : 'text-slate-400'}`}>
            <Pencil size={14} /> Tools
            <span className="text-slate-500">{showMobileTools ? '▲' : '▼'}</span>
          </button>
        </div>
        {showMobileTools && (
          <div className="h-52 overflow-y-auto border-t border-slate-800">
            <RightToolsPanel selectedTool={selectedTool} onToolSelect={setSelectedTool} />
          </div>
        )}
      </div>
    </div>
  );
}
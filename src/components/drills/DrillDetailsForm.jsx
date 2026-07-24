const DRILL_THEMES = ['Ball Handling', 'Finishing', 'Shooting', 'Passing', 'Footwork', 'Decision Making', 'Defense', 'Transition', 'Small-Sided Games', 'Team Concepts', 'Competitive', 'Press Break', 'Rebounding'];
const PLAY_THEMES = ['Half Court Offense', 'Transition Offense', 'Inbound Play', 'Press Break', 'Defensive System', 'Special Situation'];

export default function DrillDetailsForm({ form, setForm, errors }) {
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const isDrill = form.item_type !== 'Play';

  return (
    <div className="space-y-4 p-4">
      <Field label="Name" required error={errors?.name}>
        <input value={form.name} onChange={e => set('name', e.target.value)}
          placeholder={isDrill ? 'e.g. Shell Drill' : 'e.g. Zoom'}
          className={input(errors?.name)} />
      </Field>

      <Field label="Type" required error={errors?.item_type}>
        <div className="flex gap-2">
          {['Drill', 'Play'].map(t => (
            <button key={t} type="button" onClick={() => set('item_type', t)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-colors ${
                form.item_type === t
                  ? t === 'Drill' ? 'bg-blue-600 border-blue-600 text-white' : 'bg-orange-500 border-orange-500 text-white'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300'
              }`}>{t}</button>
          ))}
        </div>
      </Field>

      {isDrill ? (
        <>
          <Field label="Theme" required error={errors?.theme}>
            <select value={form.theme || ''} onChange={e => set('theme', e.target.value)} className={input(errors?.theme)}>
              <option value="">Select theme</option>
              {DRILL_THEMES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>

          <Field label="Skill Focus">
            <input value={form.skill_focus || ''} onChange={e => set('skill_focus', e.target.value)}
              placeholder="e.g. Footwork, reading the defence" className={input()} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Age Group">
              <input value={form.age_group || ''} onChange={e => set('age_group', e.target.value)} placeholder="e.g. U14" className={input()} />
            </Field>
            <Field label="Players Needed">
              <input value={form.players_needed || ''} onChange={e => set('players_needed', e.target.value)} placeholder="e.g. 4–8" className={input()} />
            </Field>
          </div>

          <Field label="Difficulty" required error={errors?.level}>
            <div className="flex gap-2">
              {[{v:1,label:'Beginner'},{v:2,label:'Moderate'},{v:3,label:'Advanced'}].map(l => (
                <button key={l.v} type="button" onClick={() => set('level', l.v)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-colors ${
                    form.level === l.v ? 'bg-slate-900 border-slate-900 text-white' : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}>{l.label}</button>
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Duration (mins)">
              <input type="number" value={form.duration_minutes || ''} onChange={e => set('duration_minutes', e.target.value)} placeholder="10" min="1" className={input()} />
            </Field>
            <Field label="Equipment">
              <input value={form.equipment || ''} onChange={e => set('equipment', e.target.value)} placeholder="e.g. Cones, ball" className={input()} />
            </Field>
          </div>

          <Field label="Description">
            <textarea rows={3} value={form.description || ''} onChange={e => set('description', e.target.value)}
              placeholder="How the drill works..." className={`${input()} resize-none`} />
          </Field>

          <Field label="Teaching Points">
            <textarea rows={2} value={form.coaching_points || ''} onChange={e => set('coaching_points', e.target.value)}
              placeholder="Key teaching moments..." className={`${input()} resize-none`} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Progressions">
              <textarea rows={2} value={form.progressions || ''} onChange={e => set('progressions', e.target.value)}
                placeholder="Make it harder..." className={`${input()} resize-none`} />
            </Field>
            <Field label="Regressions">
              <textarea rows={2} value={form.regressions || ''} onChange={e => set('regressions', e.target.value)}
                placeholder="Make it easier..." className={`${input()} resize-none`} />
            </Field>
          </div>

          <Field label="Tags">
            <input value={form.tags || ''} onChange={e => set('tags', e.target.value)}
              placeholder="e.g. team, reads, beginner (comma-separated)" className={input()} />
          </Field>

          <Field label="Video Link">
            <input value={form.video_url || ''} onChange={e => set('video_url', e.target.value)} placeholder="https://..." type="url" className={input()} />
          </Field>

          <Field label="Coach Notes">
            <textarea rows={2} value={form.coach_notes || ''} onChange={e => set('coach_notes', e.target.value)}
              placeholder="Private notes for coaching staff..." className={`${input()} resize-none`} />
          </Field>
        </>
      ) : (
        <>
          <Field label="Play Theme" required error={errors?.play_category}>
            <select value={form.play_category || ''} onChange={e => set('play_category', e.target.value)} className={input(errors?.play_category)}>
              <option value="">Select play theme</option>
              {PLAY_THEMES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Formation">
              <input value={form.formation || ''} onChange={e => set('formation', e.target.value)} placeholder="e.g. 5-Out, 4-Low" className={input()} />
            </Field>
            <Field label="Trigger">
              <input value={form.trigger || ''} onChange={e => set('trigger', e.target.value)} placeholder="e.g. Entry pass to wing" className={input()} />
            </Field>
          </div>

          <Field label="Primary Objective">
            <textarea rows={2} value={form.primary_objective || ''} onChange={e => set('primary_objective', e.target.value)}
              placeholder="Main scoring option..." className={`${input()} resize-none`} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Secondary Option">
              <textarea rows={2} value={form.secondary_option || ''} onChange={e => set('secondary_option', e.target.value)}
                placeholder="If primary is denied..." className={`${input()} resize-none`} />
            </Field>
            <Field label="Counter">
              <textarea rows={2} value={form.counter || ''} onChange={e => set('counter', e.target.value)}
                placeholder="Counter to the main action..." className={`${input()} resize-none`} />
            </Field>
          </div>

          <Field label="Teaching Points">
            <textarea rows={3} value={form.coaching_points || ''} onChange={e => set('coaching_points', e.target.value)}
              placeholder="What players need to understand..." className={`${input()} resize-none`} />
          </Field>

          <Field label="Tags">
            <input value={form.tags || ''} onChange={e => set('tags', e.target.value)}
              placeholder="e.g. BLOB, half-court, set (comma-separated)" className={input()} />
          </Field>

          <Field label="Video Link">
            <input value={form.video_url || ''} onChange={e => set('video_url', e.target.value)} placeholder="https://..." type="url" className={input()} />
          </Field>

          <Field label="Coach Notes">
            <textarea rows={2} value={form.coach_notes || ''} onChange={e => set('coach_notes', e.target.value)}
              placeholder="Private notes for coaching staff..." className={`${input()} resize-none`} />
          </Field>
        </>
      )}
    </div>
  );
}

function Field({ label, required, error, children }) {
  return (
    <div>
      {label && (
        <label className="block text-xs font-semibold text-slate-600 mb-1.5">
          {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      {children}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

function input(hasError) {
  return `w-full px-3 py-2.5 rounded-xl border text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white ${
    hasError ? 'border-red-400 focus:ring-red-400' : 'border-slate-200'
  }`;
}
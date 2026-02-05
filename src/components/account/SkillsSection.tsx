import React, { useEffect, useMemo, useState } from 'react';
import { Sparkles, CheckCircle2, Clock } from 'lucide-react';
import { CORE_SKILLS } from '../../bdl/skills';
import { bdlService } from '../../services/bdlService';
import { useAuth } from '../../contexts/AuthContext';

const DEFAULT_ON_SKILLS = new Set(['appointment-reminders', 'daily-admin-report']);

const Toggle = ({ enabled, onChange }: { enabled: boolean; onChange: () => void }) => (
  <button
    onClick={onChange}
    className={`w-11 h-6 rounded-full transition-colors flex items-center px-0.5 ${enabled ? 'bg-chippy-coral' : 'bg-slate-300'}`}
  >
    <span className={`w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform ${enabled ? 'translate-x-[20px]' : 'translate-x-0'}`} />
  </button>
);

export const SkillsSection = () => {
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [subscriptions, setSubscriptions] = useState<Record<string, 'active' | 'disabled'>>({});

  const skillDescriptions: Record<string, string> = {
    'appointment-reminders': 'Send automated reminders before appointments.',
    'post-service-feedback': 'Ask customers for feedback after service.',
    'review-request': 'Request a public review after positive feedback.',
    'daily-admin-report': 'Send a daily activity summary to the owner.'
  };

  const skillStatus = useMemo(() => {
    const map: Record<string, boolean> = {};
    CORE_SKILLS.forEach(skill => {
      const stored = subscriptions[skill.id];
      if (stored === 'active') map[skill.id] = true;
      else if (stored === 'disabled') map[skill.id] = false;
      else map[skill.id] = DEFAULT_ON_SKILLS.has(skill.id);
    });
    return map;
  }, [subscriptions]);

  useEffect(() => {
    const load = async () => {
      if (!session?.user?.id) return;
      setLoading(true);
      const skills = await bdlService.getSkillSubscriptions(session.user.id);
      const next: Record<string, 'active' | 'disabled'> = {};
      skills.forEach(s => {
        next[s.skill_id] = s.status === 'active' ? 'active' : 'disabled';
      });
      setSubscriptions(next);
      setLoading(false);
    };

    load();
  }, [session?.user?.id]);

  const toggleSkill = async (skillId: string) => {
    if (!session?.user?.id) return;
    const current = skillStatus[skillId];
    const nextStatus: 'active' | 'disabled' = current ? 'disabled' : 'active';

    setSavingId(skillId);
    setSubscriptions(prev => ({ ...prev, [skillId]: nextStatus }));
    await bdlService.upsertSkillSubscription({
      tenantId: session.user.id,
      skillId,
      status: nextStatus
    });
    setSavingId(null);
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
      <div>
        <h2 className="text-xl font-bold text-chippy-navy">Skills</h2>
        <p className="text-slate-500 text-sm">Activate or pause autonomous business workflows.</p>
      </div>

      <div className="divide-y divide-slate-100 bg-white border border-slate-200 rounded-2xl overflow-hidden">
        {CORE_SKILLS.map(skill => (
          <div key={skill.id} className="p-6 flex items-start justify-between gap-6">
            <div className="flex items-start gap-3">
              <div className="mt-1">
                <Sparkles className="w-4 h-4 text-chippy-coral" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-bold text-chippy-navy">{skill.name}</h4>
                  {DEFAULT_ON_SKILLS.has(skill.id) && !subscriptions[skill.id] && (
                    <span className="text-[10px] uppercase font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Default on</span>
                  )}
                </div>
                <p className="text-sm text-slate-500">{skillDescriptions[skill.id] || 'Automated workflow for your business.'}</p>
                <div className="flex items-center gap-2 mt-2 text-xs text-slate-400">
                  {skill.schedule?.length ? (
                    <>
                      <Clock className="w-3 h-3" />
                      <span>Scheduled</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Event driven</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {savingId === skill.id && <span className="text-xs text-slate-400">Saving...</span>}
              <Toggle enabled={!!skillStatus[skill.id]} onChange={() => toggleSkill(skill.id)} />
            </div>
          </div>
        ))}

        {CORE_SKILLS.length === 0 && !loading && (
          <div className="p-6 text-sm text-slate-500">No skills are available yet.</div>
        )}
      </div>
    </div>
  );
};

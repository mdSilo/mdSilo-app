import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { BaseModal } from '@/ui/BaseModal';
import { configureEngine, useEngines, type Engine } from '@/speech/speech';

type Props = {
  isOpen: boolean;
  handleClose: () => void;
};

/** The settings of an engine: a key left empty is kept, cleared by its button. */
function EngineSettings({ engine }: { engine: Engine }) {
  const [values, setValues] = useState<Record<string, string>>(engine.config);
  const [message, setMessage] = useState('');
  useEffect(() => setValues(engine.config), [engine.config]);

  const save = async (changes: Record<string, string>) => {
    setMessage('');
    try {
      await configureEngine(engine.id, changes);
      setMessage('Saved');
    } catch (e) {
      setMessage(String(e));
    }
  };
  // the secret ones only when typed, not to forget them
  const changes = () => Object.fromEntries(engine.fields
    .filter((f) => !f.secret || values[f.name])
    .map((f) => [f.name, values[f.name] ?? '']));

  return (
    <fieldset className="p-2 border rounded border-base-300" data-testid={`engine-${engine.id}`}>
      <legend className="px-1 font-semibold">
        {engine.name}
        <span className={`ml-2 badge badge-xs ${engine.available ? 'badge-success' : 'badge-ghost'}`}>
          {engine.available ? 'ready' : 'not set up'}
        </span>
      </legend>
      {engine.online ? (
        <p className="mb-1 text-xs text-base-content/70">The text read is sent to the service.</p>
      ) : null}
      {engine.fields.map((f) => (
        <label key={f.name} className="flex items-center gap-2 my-1">
          <span className="w-32 shrink-0">{f.label}</span>
          <input
            className="flex-1 input input-xs"
            type={f.secret ? 'password' : 'text'}
            value={values[f.name] ?? ''}
            placeholder={f.secret && engine.config[f.name] !== undefined ? 'saved, type to change' : f.placeholder}
            onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
          />
          {f.secret && engine.config[f.name] !== undefined ? (
            <button className="btn btn-ghost btn-xs" onClick={() => void save({ [f.name]: '' })}>Clear</button>
          ) : null}
        </label>
      ))}
      <div className="flex items-center gap-2 mt-1">
        <button className="btn btn-primary btn-xs" onClick={() => void save(changes())}>Save</button>
        {message ? <span className="text-xs text-base-content/70">{message}</span> : null}
      </div>
    </fieldset>
  );
}

/** The engines to read aloud and their settings. */
export default function SpeechSettings({ isOpen, handleClose }: Props) {
  const engines = useEngines((state) => state.engines);
  const [cleared, setCleared] = useState(false);
  return (
    <BaseModal title="Speech engines" isOpen={isOpen} handleClose={handleClose}>
      <div className="flex flex-col gap-3 p-3 text-sm bg-base-200">
        <ul className="text-xs">
          {engines.filter((e) => e.fields.length === 0).map((e) => (
            <li key={e.id}>
              {e.name}: {e.available ? 'ready' : 'not available here'}
            </li>
          ))}
        </ul>
        {engines.filter((e) => e.fields.length > 0).map((e) => <EngineSettings key={e.id} engine={e} />)}
        {engines.some((e) => e.kind === 'audio') ? (
          <button
            className="self-start btn btn-ghost btn-xs"
            onClick={() => void invoke('tts_clear_cache').then(() => setCleared(true))}
          >
            {cleared ? 'Audio made cleared' : 'Clear the audio made'}
          </button>
        ) : null}
      </div>
    </BaseModal>
  );
}

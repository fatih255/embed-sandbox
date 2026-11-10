import { useState } from 'preact/hooks';
import type { EmbedConfig } from './config';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  const email = value.trim();
  return email.length <= 254 && EMAIL.test(email);
}

interface Props {
  config: EmbedConfig;
  onClose: () => void;
}

export function Widget({ config, onClose }: Props) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const submit = (event: Event) => {
    event.preventDefault();
    if (!isValidEmail(email)) {
      setError('Enter an email address like you@example.com.');
      return;
    }
    setError('');
    setDone(true);
  };

  return (
    <section
      class={`card ${config.position}`}
      style={{ '--es-accent': config.accent }}
      aria-labelledby="es-title"
      data-state={done ? 'done' : 'form'}
    >
      <button type="button" class="close" aria-label="Close" onClick={onClose}>
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
      </button>
      <h2 id="es-title" class="title">
        {config.title}
      </h2>
      {done ? (
        <p class="message success" role="status">
          {config.success}
        </p>
      ) : (
        <form class="form" onSubmit={submit} noValidate>
          <p class="message">{config.message}</p>
          <label class="label" for="es-email">
            Email
          </label>
          <div class="row">
            <input
              id="es-email"
              class="email"
              type="email"
              name="email"
              autocomplete="email"
              placeholder="you@example.com"
              value={email}
              aria-invalid={error ? 'true' : 'false'}
              aria-describedby={error ? 'es-error' : undefined}
              onInput={(event) => setEmail((event.currentTarget as HTMLInputElement).value)}
            />
            <button type="submit" class="submit">
              {config.button}
            </button>
          </div>
          {error && (
            <p id="es-error" class="error" role="alert">
              {error}
            </p>
          )}
        </form>
      )}
    </section>
  );
}

import React, { useCallback, useEffect, useState } from 'react';
import ApiService, { Job } from './api';
import './App.css';

function App() {
  const [token, setToken] = useState(() => localStorage.getItem('excel-translator-token') || '');
  const [username, setUsername] = useState('user');
  const [password, setPassword] = useState('password');
  const [file, setFile] = useState<File | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!token) return;
    try { setJobs(await ApiService.getJobs(token)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load jobs.'); }
  }, [token]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!jobs.some((job) => job.status === 'PROCESSING')) return;
    const timer = window.setInterval(() => void refresh(), 1200);
    return () => window.clearInterval(timer);
  }, [jobs, refresh]);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await action(); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong.'); }
    finally { setBusy(false); }
  };

  const login = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      const result = await ApiService.login(username, password);
      localStorage.setItem('excel-translator-token', result.access_token); setToken(result.access_token);
    } catch (e) { setError(e instanceof Error ? e.message : 'Sign in failed.'); }
    finally { setBusy(false); }
  };

  const upload = () => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.xlsx')) { setError('Select an .xlsx workbook.'); return; }
    if (file.size > 50 * 1024 * 1024) { setError('Files must be 50 MB or smaller.'); return; }
    void run(async () => { await ApiService.uploadFile(file, token); setFile(null); const input = document.querySelector<HTMLInputElement>('#workbook'); if (input) input.value = ''; });
  };

  const logout = () => { localStorage.removeItem('excel-translator-token'); setToken(''); setJobs([]); setError(''); };

  if (!token) return <main className="login-shell"><form className="login-card" onSubmit={login}>
    <div className="brand-mark">EX</div><p className="eyebrow">WORKBOOK TRANSLATION</p><h1>Sign in</h1>
    <p className="muted">Translate Japanese spreadsheet text into English.</p>
    <label>Username<input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required /></label>
    <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></label>
    {error && <p className="error" role="alert">{error}</p>}
    <button className="primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
    <p className="hint">Local development account: user / password</p>
  </form></main>;

  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="#"><span className="brand-mark small">EX</span><span>Sheetling</span></a><div className="topbar-right"><span className="secure-label"><i /> Session active</span><button className="quiet" onClick={logout}>Sign out</button></div></header>
    <main className="content">
      <section className="intro"><div><p className="eyebrow">JAPANESE → ENGLISH</p><h1>Translate your workbook</h1><p className="muted">Upload an Excel file and track each translation from start to download.</p></div><div className="format-chip">XLSX <span>·</span> up to 50 MB</div></section>
      {error && <div className="error-banner" role="alert"><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss">×</button></div>}
      <section className="upload-card"><div className="upload-copy"><span className="upload-icon">↑</span><div><h2>Add a workbook</h2><p>Only .xlsx files are supported. Sheet formatting is preserved where possible.</p></div></div><div className="upload-controls"><input id="workbook" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => setFile(e.target.files?.[0] || null)} /><button className="primary" disabled={!file || busy} onClick={upload}>{busy ? 'Uploading…' : 'Upload workbook'}</button></div>{file && <p className="selected-file">Selected: <strong>{file.name}</strong> · {(file.size / 1024 / 1024).toFixed(2)} MB</p>}</section>
      <section className="jobs-section"><div className="section-heading"><div><p className="eyebrow">YOUR WORK</p><h2>Translation jobs</h2></div><button className="quiet refresh" onClick={() => void refresh()}>↻ Refresh</button></div>
        {jobs.length === 0 ? <div className="empty-state"><div className="empty-icon">▤</div><h3>No workbooks yet</h3><p>Your uploaded files and translation progress will appear here.</p></div> : <div className="job-list">{jobs.map((job) => <article className="job-card" key={job.id}>
          <div className="file-avatar">X</div><div className="job-main"><div className="job-title"><h3>{job.fileName}</h3><span className={`status ${job.status.toLowerCase()}`}>{job.status.toLowerCase()}</span></div><p className="job-meta">Added {new Date(job.createdAt).toLocaleString()} {job.textCount !== undefined && ` · ${job.textCount} text items`}</p>{job.error && <p className="error job-error">{job.error}</p>}
            {(job.status === 'PROCESSING' || job.status === 'COMPLETED') && <div className="progress-track"><div style={{ width: `${job.progress}%` }} /></div>}
            {job.status === 'PROCESSING' && <p className="progress-label">Translating workbook · {job.progress}%</p>}
          </div><div className="job-actions">{job.status === 'PENDING' && <button className="primary compact" disabled={busy} onClick={() => void run(() => ApiService.startTranslation(job.id, token))}>Start translation</button>}{job.status === 'PROCESSING' && <button className="quiet compact" disabled={busy} onClick={() => void run(() => ApiService.cancelJob(job.id, token))}>Cancel</button>}{job.status === 'FAILED' && <button className="primary compact" disabled={busy} onClick={() => void run(() => ApiService.retryJob(job.id, token))}>Retry</button>}{job.status === 'COMPLETED' && <a className="download" href={ApiService.downloadUrl(job.id)} onClick={(e) => { e.preventDefault(); void fetch(ApiService.downloadUrl(job.id), { headers: { Authorization: `Bearer ${token}` } }).then(async (res) => { if (!res.ok) throw new Error('Download failed.'); const blob = await res.blob(); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${job.fileName.replace(/\.xlsx$/i, '')}-translated.xlsx`; a.click(); URL.revokeObjectURL(url); }).catch((err) => setError(err.message)); }}>↓ Download</a>}</div>
        </article>)}</div>}
      </section>
      <footer>Translation uses your configured Ollama model. Uploaded workbooks are held temporarily while the API process is running.</footer>
    </main>
  </div>;
}

export default App;

import { useRef, useState } from 'react';

const SAMPLE_EMAIL = `From: security-alert@micros0ft-support.net
Reply-To: helpdesk@outlook-verify-account.com
Subject: URGENT: Your Microsoft 365 account will be suspended in 24 hours

We noticed unusual sign-in activity on your account.
Verify immediately at https://outlook-verify-account.com/login?token=a1b2c3d4
Failure to act will result in permanent account deletion.`;

function detectInputType(text, fileName) {
  if (fileName?.toLowerCase().endsWith('.eml')) {
    return 'eml_upload';
  }

  if (/^from:/im.test(text) && /^subject:/im.test(text)) {
    return 'headers_body';
  }

  if (/forwarded message|from:|sent:|to:|subject:/im.test(text)) {
    return 'forwarded_email';
  }

  return 'raw_text';
}

function EmailInput({ onAnalyze, loading }) {
  const [emailRaw, setEmailRaw] = useState(SAMPLE_EMAIL);
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef(null);

  function clearUploadedFile() {
    setFileName('');

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const text = await file.text();
    setEmailRaw(text);
    setFileName(file.name);
    event.target.value = '';
  }

  function handleSubmit(event) {
    event.preventDefault();
    onAnalyze({
      emailRaw,
      inputType: detectInputType(emailRaw, fileName)
    });
  }

  return (
    <form className="panel input-panel" onSubmit={handleSubmit}>
      <div className="panel-heading">
        <div>
          <h2>Raw email input</h2>
          <p>Supports raw text, `.eml` upload, pasted headers/body, and forwarded email content.</p>
        </div>
        <div className="input-actions">
          <label className="ghost-button" htmlFor="email-upload">
            Upload `.eml`
          </label>
          <input
            ref={fileInputRef}
            id="email-upload"
            type="file"
            accept=".eml,.txt,message/rfc822"
            onChange={handleFileChange}
            hidden
          />
          <button
            className="ghost-button"
            type="button"
            onClick={() => {
              setEmailRaw(SAMPLE_EMAIL);
              clearUploadedFile();
            }}
          >
            Use sample
          </button>
        </div>
      </div>

      <textarea
        value={emailRaw}
        onChange={(event) => {
          setEmailRaw(event.target.value);
          clearUploadedFile();
        }}
        placeholder="Paste a suspicious email here"
        rows={12}
      />

      <div className="submit-row">
        <div className="helper-text">{fileName ? `Loaded file: ${fileName}` : 'No file uploaded'}</div>
        <button className="primary-button" type="submit" disabled={loading || !emailRaw.trim()}>
          {loading ? 'Analyzing...' : 'Analyze email'}
        </button>
      </div>
    </form>
  );
}

export default EmailInput;

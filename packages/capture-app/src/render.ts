/**
 * ValueProof — Capture App (§4.1–4.4)
 * Server-side HTML renderer for the mobile capture page.
 * Self-contained — no build step, no framework. The HTML uses the device
 * camera via <input type="file" capture="environment"> and submits photos
 * back to the API via fetch().
 */

import type { CaptureSession } from './types.ts';
import { PHOTO_WALKTHROUGH } from './walkthrough.ts';

/**
 * Render the mobile capture page HTML for a given session.
 * This is served by the API at GET /capture/:sessionId?t=<token>.
 */
export function renderCaptureHtml(session: CaptureSession, apiBaseUrl: string): string {
  const capturedKeys = new Set(session.photos.map((p) => p.requirementKey));
  const requirements = PHOTO_WALKTHROUGH.map((req) => ({
    ...req,
    captured: capturedKeys.has(req.key),
  }));

  const requiredCount = requirements.filter((r) => r.required).length;
  const requiredCaptured = requirements.filter((r) => r.required && r.captured).length;
  const percent = Math.round((requiredCaptured / requiredCount) * 100);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
  <title>Property Capture — ${escHtml(session.subject.address)}</title>
  <style>
    :root {
      --primary: #2563eb;
      --primary-dark: #1d4ed8;
      --success: #16a34a;
      --warning: #d97706;
      --danger: #dc2626;
      --bg: #0f172a;
      --surface: #1e293b;
      --surface-2: #334155;
      --text: #f1f5f9;
      --text-muted: #94a3b8;
      --border: #475569;
      --radius: 12px;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      -webkit-font-smoothing: antialiased;
    }
    .header {
      background: var(--surface);
      padding: 16px 20px;
      border-bottom: 1px solid var(--border);
      position: sticky;
      top: 0;
      z-index: 100;
    }
    .header h1 { font-size: 18px; font-weight: 700; }
    .header .address { font-size: 13px; color: var(--text-muted); margin-top: 4px; }
    .progress-bar {
      background: var(--surface-2);
      border-radius: 8px;
      height: 8px;
      margin-top: 12px;
      overflow: hidden;
    }
    .progress-fill {
      background: var(--primary);
      height: 100%;
      border-radius: 8px;
      transition: width 0.3s ease;
    }
    .progress-text {
      font-size: 12px;
      color: var(--text-muted);
      margin-top: 4px;
      text-align: right;
    }
    .section {
      padding: 16px 20px;
    }
    .section-title {
      font-size: 14px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-muted);
      margin-bottom: 12px;
    }
    .photo-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 16px;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 16px;
      cursor: pointer;
      transition: border-color 0.2s;
    }
    .photo-card:active { border-color: var(--primary); }
    .photo-card.captured {
      border-color: var(--success);
      background: rgba(22, 163, 74, 0.08);
    }
    .photo-icon {
      width: 48px;
      height: 48px;
      border-radius: 8px;
      background: var(--surface-2);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      flex-shrink: 0;
    }
    .photo-card.captured .photo-icon { background: var(--success); }
    .photo-info { flex: 1; min-width: 0; }
    .photo-label {
      font-size: 15px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .required-badge {
      font-size: 10px;
      background: var(--warning);
      color: #000;
      padding: 1px 5px;
      border-radius: 4px;
      font-weight: 700;
    }
    .photo-instruction {
      font-size: 13px;
      color: var(--text-muted);
      margin-top: 4px;
      line-height: 1.4;
    }
    .photo-input { display: none; }
    .submit-section {
      padding: 20px;
      position: sticky;
      bottom: 0;
      background: var(--bg);
      border-top: 1px solid var(--border);
    }
    .submit-btn {
      width: 100%;
      padding: 16px;
      background: var(--primary);
      color: white;
      border: none;
      border-radius: var(--radius);
      font-size: 16px;
      font-weight: 700;
      cursor: pointer;
      transition: background 0.2s;
    }
    .submit-btn:active { background: var(--primary-dark); }
    .submit-btn:disabled {
      background: var(--surface-2);
      color: var(--text-muted);
      cursor: not-allowed;
    }
    .status-bar {
      text-align: center;
      padding: 8px;
      font-size: 13px;
      color: var(--text-muted);
    }
    .status-bar.scoring {
      background: var(--warning);
      color: #000;
      font-weight: 600;
    }
    .status-bar.complete {
      background: var(--success);
      color: white;
      font-weight: 600;
    }
    .result-card {
      background: var(--surface);
      border: 2px solid var(--success);
      border-radius: var(--radius);
      padding: 20px;
      margin: 20px;
      text-align: center;
    }
    .result-score {
      font-size: 48px;
      font-weight: 800;
      color: var(--success);
    }
    .result-label {
      font-size: 14px;
      color: var(--text-muted);
      margin-top: 4px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>📸 Property Capture</h1>
    <div class="address">${escHtml(session.subject.address)}</div>
    ${session.subject.sqft ? `<div class="address">${session.subject.sqft.toLocaleString()} sqft${session.subject.beds ? ` · ${session.subject.beds} bed` : ''}${session.subject.baths ? ` · ${session.subject.baths} bath` : ''}</div>` : ''}
    <div class="progress-bar"><div class="progress-fill" id="progressFill" style="width:${percent}%"></div></div>
    <div class="progress-text" id="progressText">${requiredCaptured}/${requiredCount} required photos (${percent}%)</div>
  </div>

  <div id="statusBar" class="status-bar">${statusMessage(session.status)}</div>

  ${renderSections(requirements)}

  <div class="submit-section">
    <button class="submit-btn" id="submitBtn" ${requiredCaptured < requiredCount ? 'disabled' : ''}>
      Submit Photos & Score Condition
    </button>
  </div>

  <div id="resultCard" style="display:none" class="result-card">
    <div class="result-label">Condition Score</div>
    <div class="result-score" id="resultScore">—</div>
    <div class="result-label" id="resultSummary"></div>
  </div>

  <script>
    const SESSION_ID = '${session.id}';
    const TOKEN = '${session.token}';
    const API_BASE = '${escHtml(apiBaseUrl)}';
    const photos = {};
    const requiredKeys = ${JSON.stringify(requirements.filter((r) => r.required).map((r) => r.key))};

    function updateProgress() {
      const captured = requiredKeys.filter(k => photos[k]).length;
      const total = requiredKeys.length;
      const pct = Math.round((captured / total) * 100);
      document.getElementById('progressFill').style.width = pct + '%';
      document.getElementById('progressText').textContent = captured + '/' + total + ' required photos (' + pct + '%)';
      document.getElementById('submitBtn').disabled = captured < total;
    }

    function handleCapture(key, input) {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function(e) {
        const base64 = e.target.result.split(',')[1];
        photos[key] = {
          requirementKey: key,
          data: base64,
          mediaType: file.type || 'image/jpeg',
          capturedAt: new Date().toISOString(),
          sizeBytes: file.size,
        };
        const card = document.querySelector('[data-key="' + key + '"]');
        if (card) {
          card.classList.add('captured');
          card.querySelector('.photo-icon').textContent = '✅';
        }
        updateProgress();
      };
      reader.readAsDataURL(file);
    }

    document.getElementById('submitBtn').addEventListener('click', async function() {
      const btn = this;
      btn.disabled = true;
      btn.textContent = 'Uploading & Scoring...';
      document.getElementById('statusBar').className = 'status-bar scoring';
      document.getElementById('statusBar').textContent = 'Analyzing photos with AI...';

      try {
        const photoList = Object.values(photos);
        const res = await fetch(API_BASE + '/capture-sessions/' + SESSION_ID + '/photos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: SESSION_ID, token: TOKEN, photos: photoList }),
        });
        const data = await res.json();

        if (data.conditionScore) {
          document.getElementById('statusBar').className = 'status-bar complete';
          document.getElementById('statusBar').textContent = 'Assessment complete!';
          document.getElementById('resultCard').style.display = 'block';
          document.getElementById('resultScore').textContent = data.conditionScore + '/5';
          if (data.assessment && data.assessment.summary) {
            document.getElementById('resultSummary').textContent = data.assessment.summary;
          }
          btn.textContent = 'Complete ✓';
        } else {
          document.getElementById('statusBar').className = 'status-bar';
          document.getElementById('statusBar').textContent = 'Photos submitted — scoring pending';
          btn.textContent = 'Submitted ✓';
        }
      } catch (err) {
        document.getElementById('statusBar').className = 'status-bar';
        document.getElementById('statusBar').textContent = 'Error: ' + err.message;
        btn.disabled = false;
        btn.textContent = 'Retry Submit';
      }
    });
  </script>
</body>
</html>`;
}

function renderSections(requirements: Array<{ key: string; label: string; category: string; required: boolean; instruction: string; captured: boolean }>): string {
  const categories = ['exterior', 'interior', 'systems', 'damage'] as const;
  const labels: Record<string, string> = {
    exterior: '🏠 Exterior',
    interior: '🏡 Interior',
    systems: '⚙️ Systems',
    damage: '⚠️ Damage Documentation',
  };

  return categories.map((cat) => {
    const items = requirements.filter((r) => r.category === cat);
    if (items.length === 0) return '';
    return `
      <div class="section">
        <div class="section-title">${labels[cat]}</div>
        ${items.map((item) => `
          <label class="photo-card ${item.captured ? 'captured' : ''}" data-key="${item.key}">
            <div class="photo-icon">${item.captured ? '✅' : '📷'}</div>
            <div class="photo-info">
              <div class="photo-label">
                ${escHtml(item.label)}
                ${item.required ? '<span class="required-badge">REQUIRED</span>' : ''}
              </div>
              <div class="photo-instruction">${escHtml(item.instruction)}</div>
            </div>
            <input type="file" accept="image/*" capture="environment" class="photo-input"
              onchange="handleCapture('${item.key}', this)">
          </label>
        `).join('')}
      </div>`;
  }).join('');
}

function statusMessage(status: string): string {
  switch (status) {
    case 'created': return 'Ready to capture photos';
    case 'in_progress': return 'Capture in progress — keep going!';
    case 'photos_complete': return 'All photos captured — ready to submit';
    case 'scoring': return 'AI is analyzing your photos...';
    case 'complete': return 'Assessment complete!';
    case 'expired': return 'Session expired';
    default: return '';
  }
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

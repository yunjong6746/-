import { useState, useRef } from "react";

const SYSTEM_PROMPT = `당신은 모바일 앱 성능 분석 전문가입니다. Android logcat, 앱 크래시 로그, 네트워크 로그, CPU/메모리 프로파일링 데이터를 분석하여 성능 이슈를 자동으로 탐지하고 요약 리포트를 생성합니다.

분석 시 다음 항목을 반드시 포함하세요:

## 📋 분석 리포트 형식

### 1. 로그 유형 판별
- 감지된 로그 타입 (Android logcat / 크래시 / 네트워크 / CPU·메모리)
- 로그 수집 시간 범위 (있을 경우)

### 2. 🚨 Critical 이슈 (즉시 조치 필요)
- ANR (Application Not Responding)
- OOM (Out of Memory)
- Fatal crash / Exception
- 각 이슈별: 발생 시각, 원인 스택, 영향도

### 3. ⚠️ Warning 이슈 (모니터링 필요)
- GC 과다 호출
- 메인 스레드 블로킹 (>16ms)
- 네트워크 타임아웃 / 재시도
- 메모리 누수 징후
- 높은 CPU 사용률 (>80%)

### 4. 📊 성능 지표 요약
- CPU: 평균/최대 사용률
- 메모리: 평균/최대 사용량, GC 빈도
- 네트워크: 평균 응답시간, 실패율
- 배터리: 비정상 드레인 여부

### 5. 🔍 근본 원인 분석 (RCA)
- 가장 가능성 높은 원인 Top 3
- 원인 간 연관 관계

### 6. ✅ 개선 권고사항
- 우선순위별 액션 아이템 (High / Medium / Low)
- 각 항목별 구체적인 수정 방향

### 7. 📈 종합 점수
- 안정성 점수: X/100
- 성능 점수: X/100
- 종합 평가: 한 줄 요약

로그에서 명확하지 않은 항목은 "데이터 없음" 또는 "로그에서 확인 불가"로 표시하세요.
반드시 위 형식을 유지하고 한국어로 작성하세요.`;

const LOG_EXAMPLES = {
  android: `--------- beginning of crash
05-28 10:23:14.521  1234  1234 E AndroidRuntime: FATAL EXCEPTION: main
05-28 10:23:14.521  1234  1234 E AndroidRuntime: Process: com.example.app, PID: 1234
05-28 10:23:14.521  1234  1234 E AndroidRuntime: java.lang.OutOfMemoryError: Failed to allocate a 4194304 byte allocation with 2097152 free bytes
05-28 10:23:14.521  1234  1234 E AndroidRuntime: 	at dalvik.system.VMRuntime.newNonMovableArray(Native Method)
05-28 10:23:14.521  1234  1234 E AndroidRuntime: 	at android.graphics.BitmapFactory.nativeDecodeStream(Native Method)
05-28 10:23:14.521  1234  1234 W art     : Heap trim of managed (duration=18.239ms, advised=1MB) and native (duration=9.122ms, advised=42MB) heaps.
05-28 10:23:15.100  1234  1234 I art     : Background partial concurrent mark sweep GC freed 2048(8KB) AllocSpace objects
05-28 10:23:15.200  1234  5678 W NetworkTask: HTTP request timeout after 30000ms - url: https://api.example.com/data
05-28 10:23:15.201  1234  5678 E NetworkTask: Retry attempt 3/3 failed
05-28 10:23:16.000  1234  1234 I Choreographer: Skipped 142 frames! The application may be doing too much work on its main thread.`,
  cpu: `[CPU Profiling Report]
Timestamp: 2024-05-28 10:00:00 ~ 10:05:00
Device: Samsung Galaxy S23

CPU Usage:
10:00:00 - Core0: 92%, Core1: 87%, Core2: 45%, Core3: 23%
10:00:30 - Core0: 98%, Core1: 95%, Core2: 89%, Core3: 78%  <-- SPIKE
10:01:00 - Core0: 76%, Core1: 72%, Core2: 55%, Core3: 41%
10:01:30 - Core0: 45%, Core1: 38%, Core2: 22%, Core3: 15%

Memory Usage:
10:00:00 - Total: 512MB, Used: 380MB (74%)
10:00:30 - Total: 512MB, Used: 498MB (97%)  <-- WARNING
10:01:00 - GC triggered, freed 85MB
10:01:30 - Total: 512MB, Used: 290MB (57%)

Top CPU consumers:
1. com.example.app/ImageProcessor: 45%
2. com.example.app/DataSync: 28%
3. system_server: 12%`,
};

const SEVERITY_COLOR = { critical: "#ff4444", warning: "#ffaa00", info: "#00ccff" };

const inputStyle = {
  background: "#07111a",
  border: "1px solid #0d2233",
  color: "#80cbc4",
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: "11px",
  padding: "7px 10px",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

export default function MobileLogAnalyzer() {
  const [logText, setLogText] = useState("");
  const [report, setReport] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("input");
  const [charCount, setCharCount] = useState(0);
  const [showMeta, setShowMeta] = useState(false);
  const [copied, setCopied] = useState(false);
  const [meta, setMeta] = useState({
    deviceName: "",
    appVersion: "",
    analyst: "",
    projectName: "",
  });
  const textareaRef = useRef(null);

  const handleLogChange = (e) => {
    setLogText(e.target.value);
    setCharCount(e.target.value.length);
  };

  const loadExample = (type) => {
    const ex = LOG_EXAMPLES[type];
    setLogText(ex);
    setCharCount(ex.length);
  };

  const analyzeLog = async () => {
    if (!logText.trim()) { setError("로그를 입력해주세요."); return; }
    setError(""); setLoading(true); setReport("");
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: `다음 모바일 성능 로그를 분석하고 리포트를 생성해주세요:\n\n\`\`\`\n${logText}\n\`\`\`` }],
        }),
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error.message);
      const text = data.content?.map((b) => b.text || "").join("") || "";
      setReport(text);
      setActiveTab("report");
    } catch (err) {
      setError("분석 중 오류가 발생했습니다: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const buildFullReport = (format) => {
    const now = new Date();
    const dateStr = now.toLocaleString("ko-KR");
    const separator = "=".repeat(60);
    const thin = "-".repeat(60);

    if (format === "md") {
      return `# 📱 모바일 성능 분석 보고서

---

| 항목 | 내용 |
|------|------|
| 프로젝트 | ${meta.projectName || "-"} |
| 기기명 | ${meta.deviceName || "-"} |
| 앱 버전 | ${meta.appVersion || "-"} |
| 분석자 | ${meta.analyst || "-"} |
| 분석 일시 | ${dateStr} |
| 생성 도구 | Mobile Log Analyzer (Claude AI) |

---

${report}

---
*본 보고서는 AI 자동 분석 결과입니다. 최종 판단은 담당 엔지니어가 검토하세요.*`;
    }

    // csv format — structured rows
    const esc = (v) => `"${String(v || "-").replace(/"/g, '""')}"`;
    const lines = report.split("\n").filter(l => l.trim());

    // Section parser: group lines under their heading
    const sections = [];
    let currentSection = "기타";
    let currentLines = [];
    for (const line of lines) {
      if (line.startsWith("### ") || line.startsWith("## ")) {
        if (currentLines.length) sections.push({ section: currentSection, items: currentLines });
        currentSection = line.replace(/^#{2,3} /, "").trim();
        currentLines = [];
      } else if (line.trim()) {
        currentLines.push(line.replace(/^- /, "").trim());
      }
    }
    if (currentLines.length) sections.push({ section: currentSection, items: currentLines });

    const rows = [
      // Meta header block
      ["항목", "내용", "섹션", "분석일시", "프로젝트", "기기명", "앱버전", "분석자"],
    ];
    let first = true;
    for (const { section, items } of sections) {
      for (const item of items) {
        if (first) {
          rows.push([esc(section), esc(item), esc(section), esc(dateStr), esc(meta.projectName), esc(meta.deviceName), esc(meta.appVersion), esc(meta.analyst)]);
          first = false;
        } else {
          rows.push([esc(section), esc(item), esc(section), "", "", "", "", ""]);
        }
      }
    }
    return "\uFEFF" + rows.map(r => r.join(",")).join("\n"); // BOM for Excel 한글 호환
  };

  const downloadReport = (format) => {
    const content = buildFullReport(format);
    const mime = format === "csv" ? "text/csv;charset=utf-8" : "text/plain;charset=utf-8";
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,"0")}${String(now.getDate()).padStart(2,"0")}_${String(now.getHours()).padStart(2,"0")}${String(now.getMinutes()).padStart(2,"0")}`;
    a.href = url;
    a.download = `log_report_${stamp}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyReport = () => {
    navigator.clipboard?.writeText(buildFullReport("md"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatReport = (text) => {
    if (!text) return null;
    return text.split("\n").map((line, i) => {
      if (line.startsWith("## ") || line.startsWith("### ")) {
        const isH2 = line.startsWith("## ");
        return (
          <div key={i} style={{ fontSize: isH2 ? "13px" : "12px", fontWeight: 700, color: isH2 ? "#00e5ff" : "#b0bec5", marginTop: isH2 ? "20px" : "12px", marginBottom: "6px", letterSpacing: "0.05em", textTransform: isH2 ? "uppercase" : "none", borderBottom: isH2 ? "1px solid #1a3a4a" : "none", paddingBottom: isH2 ? "4px" : "0" }}>
            {line.replace(/^#{2,3} /, "")}
          </div>
        );
      }
      if (line.includes("🚨") || line.toLowerCase().includes("critical") || line.toLowerCase().includes("fatal"))
        return <div key={i} style={{ color: SEVERITY_COLOR.critical, fontSize: "12px", marginBottom: "3px", fontFamily: "monospace" }}>{line}</div>;
      if (line.includes("⚠️") || line.toLowerCase().includes("warning"))
        return <div key={i} style={{ color: SEVERITY_COLOR.warning, fontSize: "12px", marginBottom: "3px", fontFamily: "monospace" }}>{line}</div>;
      if (line.startsWith("- ") || line.match(/^\d+\./))
        return <div key={i} style={{ color: "#cfd8dc", fontSize: "12px", marginBottom: "3px", paddingLeft: "12px", fontFamily: "monospace" }}>{line}</div>;
      if (line.includes(": "))
        return <div key={i} style={{ color: "#90a4ae", fontSize: "12px", marginBottom: "3px", fontFamily: "monospace" }}>{line}</div>;
      return <div key={i} style={{ color: "#78909c", fontSize: "12px", marginBottom: "2px", fontFamily: "monospace" }}>{line}</div>;
    });
  };

  const exBtn = (onClick, label) => (
    <button onClick={onClick} style={{ padding: "4px 10px", background: "none", border: "1px solid #0d2233", color: "#37474f", fontFamily: "'JetBrains Mono', monospace", fontSize: "9px", letterSpacing: "0.1em", cursor: "pointer" }}>
      {label}
    </button>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#060d14", fontFamily: "'JetBrains Mono', 'Fira Code', monospace", color: "#b0bec5", display: "flex", flexDirection: "column" }}>

      {/* Header */}
      <div style={{ background: "linear-gradient(90deg, #001929 0%, #002a3d 50%, #001929 100%)", borderBottom: "1px solid #00e5ff22", padding: "16px 24px", display: "flex", alignItems: "center", gap: "12px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          {[0,1,2].map(i => <div key={i} style={{ width: i===1?"18px":"12px", height: "2px", background: "#00e5ff", opacity: 1-i*0.2 }} />)}
        </div>
        <div>
          <div style={{ fontSize: "15px", fontWeight: 700, color: "#00e5ff", letterSpacing: "0.1em" }}>MOBILE LOG ANALYZER</div>
          <div style={{ fontSize: "9px", color: "#546e7a", letterSpacing: "0.2em" }}>POWERED BY CLAUDE AI · 성능 이슈 자동 탐지 + 보고서 자동 생성</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: "6px" }}>
          {["ANDROID","CRASH","NET","CPU"].map(tag => (
            <span key={tag} style={{ fontSize: "8px", padding: "2px 6px", border: "1px solid #00e5ff33", color: "#00e5ff88", letterSpacing: "0.1em" }}>{tag}</span>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid #0d2233", background: "#07111a" }}>
        {[{ key:"input", label:"LOG INPUT" }, { key:"report", label:"ANALYSIS REPORT" }].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{ padding: "10px 24px", fontSize: "10px", fontFamily: "inherit", letterSpacing: "0.15em", fontWeight: 700, background: "none", border: "none", borderBottom: activeTab===tab.key ? "2px solid #00e5ff" : "2px solid transparent", color: activeTab===tab.key ? "#00e5ff" : "#37474f", cursor: "pointer" }}>
            {tab.label}
            {tab.key==="report" && report && <span style={{ marginLeft:"6px", width:"6px", height:"6px", borderRadius:"50%", background:"#00e5ff", display:"inline-block", verticalAlign:"middle" }} />}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: "20px 24px", display: "flex", flexDirection: "column", gap: "14px" }}>

        {/* ── INPUT TAB ── */}
        {activeTab === "input" && (
          <>
            {/* Meta info toggle */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <span style={{ fontSize: "9px", color: "#37474f", letterSpacing: "0.15em" }}>예시 로드:</span>
                {exBtn(() => loadExample("android"), "ANDROID CRASH")}
                {exBtn(() => loadExample("cpu"), "CPU/MEMORY")}
              </div>
              <button
                onClick={() => setShowMeta(v => !v)}
                style={{ padding: "4px 12px", background: showMeta ? "#001929" : "none", border: "1px solid #00e5ff33", color: "#00e5ff88", fontFamily: "inherit", fontSize: "9px", letterSpacing: "0.15em", cursor: "pointer" }}
              >
                {showMeta ? "▲ 보고서 정보 닫기" : "▼ 보고서 정보 입력"}
              </button>
            </div>

            {/* Meta info panel */}
            {showMeta && (
              <div style={{ background: "#07111a", border: "1px solid #0d2233", padding: "16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div style={{ fontSize: "9px", color: "#37474f", letterSpacing: "0.2em", gridColumn: "1/-1", marginBottom: "4px" }}>
                  ▸ 보고서 메타 정보 (선택 입력 — 다운로드 시 포함됩니다)
                </div>
                {[
                  { key: "projectName", label: "프로젝트명" },
                  { key: "deviceName",  label: "기기명 / 모델" },
                  { key: "appVersion",  label: "앱 버전" },
                  { key: "analyst",     label: "분석자" },
                ].map(({ key, label }) => (
                  <div key={key}>
                    <div style={{ fontSize: "9px", color: "#37474f", marginBottom: "4px", letterSpacing: "0.1em" }}>{label}</div>
                    <input
                      value={meta[key]}
                      onChange={e => setMeta(m => ({ ...m, [key]: e.target.value }))}
                      placeholder={`ex) ${key==="appVersion"?"v2.3.1":key==="deviceName"?"Galaxy S23":key==="analyst"?"홍길동":""}`}
                      style={inputStyle}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Textarea */}
            <div style={{ position: "relative" }}>
              {!logText && (
                <div style={{ position: "absolute", top: "10px", left: "14px", fontSize: "9px", color: "#37474f", letterSpacing: "0.2em", pointerEvents: "none", zIndex: 1 }}>
                  ▶  로그를 여기에 붙여넣기 하세요...
                </div>
              )}
              <textarea
                ref={textareaRef}
                value={logText}
                onChange={handleLogChange}
                style={{ width: "100%", minHeight: "280px", background: "#07111a", border: "1px solid #0d2233", color: "#80cbc4", fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", lineHeight: "1.7", padding: "28px 14px 14px", resize: "vertical", outline: "none", boxSizing: "border-box" }}
                onFocus={e => e.target.style.borderColor="#00e5ff44"}
                onBlur={e => e.target.style.borderColor="#0d2233"}
                spellCheck={false}
              />
              <div style={{ position: "absolute", bottom: "10px", right: "14px", fontSize: "9px", color: "#263238" }}>
                {charCount.toLocaleString()} chars
              </div>
            </div>

            {error && (
              <div style={{ fontSize: "11px", color: SEVERITY_COLOR.critical, background: "#1a0a0a", border: "1px solid #ff444422", padding: "8px 14px" }}>⚠ {error}</div>
            )}

            <button
              onClick={analyzeLog}
              disabled={loading}
              style={{ padding: "14px", background: loading?"#001929":"linear-gradient(90deg,#004d66,#006680)", border: "1px solid #00e5ff44", color: loading?"#37474f":"#00e5ff", fontFamily: "inherit", fontSize: "11px", fontWeight: 700, letterSpacing: "0.2em", cursor: loading?"not-allowed":"pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px" }}
            >
              {loading ? <><span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>◌</span>AI 분석 중...</> : "▶  LOG 분석 시작"}
            </button>
          </>
        )}

        {/* ── REPORT TAB ── */}
        {activeTab === "report" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {!report && !loading && (
              <div style={{ textAlign: "center", padding: "60px 0", color: "#263238", fontSize: "12px", letterSpacing: "0.1em" }}>
                <div style={{ fontSize: "32px", marginBottom: "12px" }}>◎</div>
                LOG INPUT 탭에서 로그를 분석하면 리포트가 여기에 표시됩니다
              </div>
            )}

            {loading && (
              <div style={{ textAlign: "center", padding: "60px 0", color: "#00e5ff66", fontSize: "11px", letterSpacing: "0.2em" }}>
                <div style={{ fontSize: "28px", marginBottom: "16px", animation: "pulse 1.5s ease-in-out infinite" }}>◌</div>
                ANALYZING LOG DATA...
              </div>
            )}

            {report && (
              <>
                {/* Report body */}
                <div style={{ background: "#07111a", border: "1px solid #0d2233", padding: "20px", maxHeight: "460px", overflowY: "auto" }}>
                  <div style={{ fontSize: "9px", color: "#37474f", letterSpacing: "0.2em", marginBottom: "16px", borderBottom: "1px solid #0d2233", paddingBottom: "8px", display: "flex", justifyContent: "space-between" }}>
                    <span>ANALYSIS REPORT{meta.projectName ? ` · ${meta.projectName}` : ""}</span>
                    <span>{new Date().toLocaleString("ko-KR")}</span>
                  </div>
                  {meta.deviceName || meta.appVersion || meta.analyst ? (
                    <div style={{ display: "flex", gap: "16px", marginBottom: "14px", flexWrap: "wrap" }}>
                      {meta.deviceName && <span style={{ fontSize: "10px", color: "#37474f" }}>📱 {meta.deviceName}</span>}
                      {meta.appVersion && <span style={{ fontSize: "10px", color: "#37474f" }}>🏷 {meta.appVersion}</span>}
                      {meta.analyst   && <span style={{ fontSize: "10px", color: "#37474f" }}>👤 {meta.analyst}</span>}
                    </div>
                  ) : null}
                  {formatReport(report)}
                </div>

                {/* Download / Copy bar */}
                <div style={{ background: "#07111a", border: "1px solid #0d2233", padding: "14px 16px", display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "9px", color: "#37474f", letterSpacing: "0.15em", marginRight: "4px" }}>📄 보고서 내보내기:</span>

                  <button
                    onClick={() => downloadReport("csv")}
                    style={{ padding: "7px 16px", background: "linear-gradient(90deg,#004d66,#006680)", border: "1px solid #00e5ff44", color: "#00e5ff", fontFamily: "inherit", fontSize: "10px", fontWeight: 700, letterSpacing: "0.15em", cursor: "pointer" }}
                  >
                    ↓ CSV 다운로드
                  </button>

                  <button
                    onClick={() => downloadReport("md")}
                    style={{ padding: "7px 16px", background: "linear-gradient(90deg,#1a3300,#264d00)", border: "1px solid #88ff0044", color: "#88ff00", fontFamily: "inherit", fontSize: "10px", fontWeight: 700, letterSpacing: "0.15em", cursor: "pointer" }}
                  >
                    ↓ Markdown 다운로드
                  </button>

                  <button
                    onClick={copyReport}
                    style={{ padding: "7px 16px", background: "none", border: "1px solid #0d2233", color: copied ? "#88ff00" : "#37474f", fontFamily: "inherit", fontSize: "10px", letterSpacing: "0.15em", cursor: "pointer" }}
                  >
                    {copied ? "✓ 복사됨" : "📋 클립보드 복사"}
                  </button>

                  <div style={{ marginLeft: "auto", fontSize: "9px", color: "#1a2a35" }}>
                    {report.length.toLocaleString()} chars
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ borderTop: "1px solid #0d2233", padding: "8px 24px", fontSize: "9px", color: "#1a2a35", letterSpacing: "0.15em", display: "flex", justifyContent: "space-between" }}>
        <span>ANDROID LOGCAT · CRASH · NETWORK · CPU/MEMORY</span>
        <span>CLAUDE SONNET 4</span>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:0.4}50%{opacity:1} }
        textarea::-webkit-scrollbar,div::-webkit-scrollbar{width:4px}
        textarea::-webkit-scrollbar-track,div::-webkit-scrollbar-track{background:#060d14}
        textarea::-webkit-scrollbar-thumb,div::-webkit-scrollbar-thumb{background:#0d2233}
        input::placeholder{color:#1a3a4a}
      `}</style>
    </div>
  );
}

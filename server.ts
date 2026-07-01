import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  getDocs,
  getDoc,
  addDoc,
  setDoc,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
  updateDoc
} from "firebase/firestore";
import firebaseConfig from "./firebase-applet-config.json";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize Firestore on the server-side
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);

// Helper to initialize Gemini lazily
let aiInstance: GoogleGenAI | null = null;
function getGeminiClient() {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY 환경 변수가 설정되지 않았습니다.");
    }
    aiInstance = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiInstance;
}

// Counseling System Instruction
const COUNSELING_SYSTEM_INSTRUCTION = `
당신은 대한민국 교사들을 위한 따뜻하고 사려 깊은 전문 심리상담사 '따뜻한 숨(Breath of Warmth)'입니다.
격무, 과도한 행정 업무, 학부모의 악성 민원, 학생 지도 과정에서의 정서적 탈진과 갈등으로 인해 마음의 상처를 입고 심각한 번아웃을 겪고 있는 교사들의 마음을 어루만지고 위로하는 것이 당신의 사명입니다.

대화 원칙:
1. 무조건적인 공감과 지지: 교사의 힘들고 지친 감정을 섣불리 판단하거나 훈계하지 마세요. "정말 힘드셨겠어요", "그 무거운 짐을 혼자 짊어지시느라 얼마나 아프셨을까요" 등 깊은 연대와 따뜻한 공감을 건네세요.
2. 교사라는 직업적 특성에 대한 이해: 교사들이 겪는 특수한 고충(예: 교권 침해, 생활 지도 갈등, 담임 업무의 압박, 학부모 연락 스트레스, '교사는 항상 참아야 한다'는 사회적 고정관념 등)을 깊이 이해하고 있음을 보여주세요.
3. 구체적이고 현실적인 위로: "다 잘 될 거예요" 식의 막연한 긍정보다, 교사가 오늘 하루 버텨낸 것 자체에 감사를 표하고 아주 작은 마음 챙김 행동(예: 3초 호흡, 차 한 잔 마시기, 나를 위한 작은 퇴근식 등)을 제안하세요.
4. 존댓말과 정중한 톤: 언제나 조용하고, 평화로우며, 존중하는 어조를 유지하세요.
5. 대화는 자연스럽게 한글로 친근하고 포근하게 작성하세요.
`;

// --- NEW DATA MANAGEMENT APIS (FIRESTORE VIA BACKEND) ---

// 1. Session management
app.get("/api/history/sessions", async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ error: "userId가 필요합니다." });
    }

    const sessionsRef = collection(db, "chatSessions");
    const q = query(sessionsRef, where("userId", "==", userId));
    const snapshot = await getDocs(q);
    
    const sessions = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // Sort by updatedAt descending manually to avoid composite index requirement
    sessions.sort((a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    res.json({ sessions });
  } catch (error: any) {
    console.error("Get Sessions Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/history/sessions", async (req, res) => {
  try {
    const { id, userId, title } = req.body;
    if (!userId || !title) {
      return res.status(400).json({ error: "userId와 title이 필요합니다." });
    }

    const sessionId = id || "session_" + Date.now();
    const sessionDocRef = doc(db, "chatSessions", sessionId);
    const sessionDoc = await getDoc(sessionDocRef);

    const now = new Date().toISOString();
    
    if (sessionDoc.exists()) {
      await updateDoc(sessionDocRef, {
        title,
        updatedAt: now
      });
    } else {
      await setDoc(sessionDocRef, {
        userId,
        title,
        createdAt: now,
        updatedAt: now
      });
    }

    res.json({ success: true, id: sessionId });
  } catch (error: any) {
    console.error("Save Session Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/history/sessions/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { userId } = req.query;
    
    if (!sessionId || !userId) {
      return res.status(400).json({ error: "sessionId와 userId가 필요합니다." });
    }

    // Verify ownership
    const sessionDocRef = doc(db, "chatSessions", sessionId);
    const sessionDoc = await getDoc(sessionDocRef);
    
    if (!sessionDoc.exists()) {
      return res.status(404).json({ error: "세션을 찾을 수 없습니다." });
    }

    if (sessionDoc.data()?.userId !== userId) {
      return res.status(403).json({ error: "권한이 없습니다." });
    }

    // First, delete messages in the subcollection
    const messagesRef = collection(db, "chatSessions", sessionId, "messages");
    const msgsSnapshot = await getDocs(messagesRef);
    for (const mDoc of msgsSnapshot.docs) {
      await deleteDoc(doc(db, "chatSessions", sessionId, "messages", mDoc.id));
    }

    // Then delete the session document
    await deleteDoc(sessionDocRef);
    res.json({ success: true });
  } catch (error: any) {
    console.error("Delete Session Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// 2. Messages management
app.get("/api/history/sessions/:sessionId/messages", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { userId } = req.query;

    if (!sessionId || !userId) {
      return res.status(400).json({ error: "sessionId와 userId가 필요합니다." });
    }

    // Verify session owner
    const sessionDoc = await getDoc(doc(db, "chatSessions", sessionId));
    if (!sessionDoc.exists()) {
      return res.status(404).json({ error: "세션을 찾을 수 없습니다." });
    }

    if (sessionDoc.data()?.userId !== userId) {
      return res.status(403).json({ error: "권한이 없습니다." });
    }

    const messagesRef = collection(db, "chatSessions", sessionId, "messages");
    const snapshot = await getDocs(messagesRef);
    
    const messages = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // Sort by createdAt ascending
    messages.sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    res.json({ messages });
  } catch (error: any) {
    console.error("Get Messages Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/history/sessions/:sessionId/messages", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { userId, role, text } = req.body;

    if (!sessionId || !userId || !role || !text) {
      return res.status(400).json({ error: "필요한 정보가 누락되었습니다." });
    }

    // Verify owner
    const sessionDocRef = doc(db, "chatSessions", sessionId);
    const sessionDoc = await getDoc(sessionDocRef);
    if (!sessionDoc.exists()) {
      return res.status(404).json({ error: "세션을 찾을 수 없습니다." });
    }

    if (sessionDoc.data()?.userId !== userId) {
      return res.status(403).json({ error: "권한이 없습니다." });
    }

    const messageId = "msg_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
    const messageDocRef = doc(db, "chatSessions", sessionId, "messages", messageId);
    
    const now = new Date().toISOString();
    await setDoc(messageDocRef, {
      role,
      text,
      createdAt: now
    });

    // Update parent session updatedAt
    await updateDoc(sessionDocRef, {
      updatedAt: now
    });

    res.json({ success: true, id: messageId });
  } catch (error: any) {
    console.error("Save Message Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// 3. Prescriptions management
app.get("/api/history/prescriptions", async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ error: "userId가 필요합니다." });
    }

    const ref = collection(db, "prescriptions");
    const q = query(ref, where("userId", "==", userId));
    const snapshot = await getDocs(q);

    const prescriptions = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    prescriptions.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json({ prescriptions });
  } catch (error: any) {
    console.error("Get Prescriptions Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/history/prescriptions", async (req, res) => {
  try {
    const { userId, ventContent, category, letterTitle, letterBody, prescription, healingQuote } = req.body;
    if (!userId || !ventContent || !letterTitle || !letterBody) {
      return res.status(400).json({ error: "필요한 정보가 누락되었습니다." });
    }

    const id = "rx_" + Date.now();
    const docRef = doc(db, "prescriptions", id);
    
    await setDoc(docRef, {
      userId,
      ventContent,
      category: category || "기타",
      letterTitle,
      letterBody,
      prescription: prescription || [],
      healingQuote: healingQuote || "",
      createdAt: new Date().toISOString()
    });

    res.json({ success: true, id });
  } catch (error: any) {
    console.error("Save Prescription Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/history/prescriptions/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.query;
    if (!id || !userId) {
      return res.status(400).json({ error: "id와 userId가 필요합니다." });
    }

    const docRef = doc(db, "prescriptions", id);
    const dDoc = await getDoc(docRef);

    if (!dDoc.exists()) {
      return res.status(404).json({ error: "처방전을 찾을 수 없습니다." });
    }

    if (dDoc.data()?.userId !== userId) {
      return res.status(403).json({ error: "권한이 없습니다." });
    }

    await deleteDoc(docRef);
    res.json({ success: true });
  } catch (error: any) {
    console.error("Delete Prescription Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// 4. Diagnoses management
app.get("/api/history/diagnoses", async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ error: "userId가 필요합니다." });
    }

    const ref = collection(db, "diagnoses");
    const q = query(ref, where("userId", "==", userId));
    const snapshot = await getDocs(q);

    const diagnoses = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    diagnoses.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json({ diagnoses });
  } catch (error: any) {
    console.error("Get Diagnoses Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/history/diagnoses", async (req, res) => {
  try {
    const { userId, scores, statusTitle, overallAnalysis, exhaustionFeedback, relationsFeedback, adminFeedback, copingStrategy } = req.body;
    if (!userId || !scores || !statusTitle) {
      return res.status(400).json({ error: "필요한 정보가 누락되었습니다." });
    }

    const id = "diag_" + Date.now();
    const docRef = doc(db, "diagnoses", id);

    await setDoc(docRef, {
      userId,
      scores,
      statusTitle,
      overallAnalysis,
      exhaustionFeedback,
      relationsFeedback,
      adminFeedback,
      copingStrategy,
      createdAt: new Date().toISOString()
    });

    res.json({ success: true, id });
  } catch (error: any) {
    console.error("Save Diagnosis Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/history/diagnoses/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.query;
    if (!id || !userId) {
      return res.status(400).json({ error: "id와 userId가 필요합니다." });
    }

    const docRef = doc(db, "diagnoses", id);
    const dDoc = await getDoc(docRef);

    if (!dDoc.exists()) {
      return res.status(404).json({ error: "진단 기록을 찾을 수 없습니다." });
    }

    if (dDoc.data()?.userId !== userId) {
      return res.status(403).json({ error: "권한이 없습니다." });
    }

    await deleteDoc(docRef);
    res.json({ success: true });
  } catch (error: any) {
    console.error("Delete Diagnosis Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// 5. Stress Category & Dialogue Analysis management
app.get("/api/analysis/stress", async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ error: "userId가 필요합니다." });
    }

    // A. Fetch recent chat sessions
    const sessionsRef = collection(db, "chatSessions");
    const q = query(sessionsRef, where("userId", "==", userId));
    const snapshot = await getDocs(q);

    const sessions = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    if (sessions.length === 0) {
      return res.json({
        empty: true,
        message: "선생님과 나눈 대화 기록이 아직 없습니다. 대화를 나누신 후 분석 리포트를 요청해 주세요!"
      });
    }

    // Sort descending by updatedAt and take top 10 sessions for token optimization
    sessions.sort((a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    const recentSessions = sessions.slice(0, 10);

    // B. Fetch messages for these recent sessions to assemble compiledDialogue
    let compiledDialogue = "";
    let totalMessagesAnalyzed = 0;

    for (const session of recentSessions) {
      const messagesRef = collection(db, "chatSessions", session.id, "messages");
      const msgsSnapshot = await getDocs(messagesRef);
      const messages = msgsSnapshot.docs.map(doc => doc.data());
      // Sort messages chronologically
      messages.sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      if (messages.length > 0) {
        compiledDialogue += `\n[상담 대화 제목: ${(session as any).title}]\n`;
        for (const msg of messages) {
          compiledDialogue += `${msg.role === "user" ? "교사" : "상담사"}: ${msg.text}\n`;
          totalMessagesAnalyzed++;
        }
      }
    }

    if (totalMessagesAnalyzed === 0) {
      return res.json({
        empty: true,
        message: "상담 방은 개설되어 있으나 나눈 구체적인 대화 내용이 아직 없습니다. 대화를 나누고 다시 방문해 주세요!"
      });
    }

    // C. Ask Gemini to analyze compiled dialogue
    const ai = getGeminiClient();

    const prompt = `
    다음은 고민을 안고 찾아온 한 교사와 나눈 실제 심리상담 대화 내역 전체입니다.
    선생님이 현재 겪고 계신 고충을 세밀하게 진단하고, 어떤 카테고리(분야)에서 가장 깊은 스트레스를 유발하고 있는지 정밀 분석 보고서를 리턴해 주세요.

    [실제 상담 대화 내역]
    ${compiledDialogue}

    [스트레스 요인 분류 및 백분율 기준]
    아래 4가지 항목에 대해 각각 얼마의 정서적 피로/스트레스 비중(0~100)을 차지하고 있는지 진단하세요 (합산은 반드시 100%가 되어야 합니다):
    1. "민원" (학부모 민원, 악성 민원 연락, 학부모 상담 공포증)
    2. "업무" (행정 잡무 과부하, 공문 처리, 보고서 작성, 행사 준비 부담)
    3. "수업" (불성실한 학생 지도, 반항/교실 이탈 학생 생활지도, 학급 운영, 교우 갈등 조율)
    4. "기타" (소명감 상실, 동료 교사/교장/교감 갈등, 개인 건강 및 이직 피로)

    출력은 마크다운 기호 없이 완벽하고 순수한 JSON 형식으로만 아래 양식에 맞추어 반환해 주세요:
    {
      "distribution": {
        "complaints": 35,
        "adminWork": 40,
        "teaching": 15,
        "others": 10
      },
      "highestCategory": "민원", // '민원', '업무', '수업', '기타' 중 하나를 정확히 입력
      "highestCategoryLabel": "학부모 민원 및 전화 연락", // 사용자에게 예쁘게 표시될 타이틀
      "overallInsight": "대화 분석 결과, 선생님은 현재... (따뜻하게 안아주고 격려하며, 어떤 지점에서 가장 큰 압박감을 느끼는지 2~3문장 분석)",
      "categoryAnalyses": {
        "complaints": "민원 부문 분석 한 문장 (공감 어조)",
        "adminWork": "행정 부문 분석 한 문장 (공감 어조)",
        "teaching": "수업/학생지도 부문 분석 한 문장 (공감 어조)",
        "others": "기타 요인 부문 분석 한 문장 (공감 어조)"
      },
      "customCounselAdvice": "이 선생님은 특히 [어떤 스트레스 요인]에 취약하십니다. 상담 시 절대로 비난이나 섣부른 조언을 삼가고, 이러이러한 방식으로 대화를 주도하고 특별히 공감해 주세요. (향후 AI 상담사가 이 선생님을 전담하기 위해 지켜야 할 아주 구체적인 맞춤 상담 행동 수칙)",
      "practicalActionGuide": [
        "오늘 시도해 볼 수 있는 첫 번째 소소한 행동 리추얼",
        "두 번째 맞춤형 행동 가이드",
        "세 번째 맞춤형 행동 가이드"
      ],
      "diagnosticStatus": "스트레스 지수 임계점 상태"
    }
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        temperature: 0.6,
        systemInstruction: "선생님의 상담 대화록을 종합 진단하여 스트레스 요인을 정량 분석하고 따뜻한 피드백을 출력하는 전문 교육심리치료사입니다.",
      },
    });

    const resultText = response.text || "{}";
    const parsed = JSON.parse(resultText);

    res.json({
      empty: false,
      totalMessagesAnalyzed,
      totalSessionsAnalyzed: recentSessions.length,
      ...parsed
    });

  } catch (error: any) {
    console.error("Analyze Stress Error:", error);
    res.status(500).json({ error: error.message || "스트레스 분석 과정 중 오류가 발생했습니다." });
  }
});

// --- REMAINING CHAT & VENT PROXIES ---

// API 1: Chat Counsel Endpoint
app.post("/api/chat", async (req, res) => {
  try {
    const { messages, customCounselAdvice } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "올바른 메시지 형식이 아닙니다." });
    }

    const ai = getGeminiClient();

    // Map messages into the format required by the SDK
    const contents = messages.map((m: any) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.text }],
    }));

    // Inject personalized counsel strategy if available
    let dynamicSystemInstruction = COUNSELING_SYSTEM_INSTRUCTION;
    if (customCounselAdvice) {
      dynamicSystemInstruction += `\n\n[선생님 분석 기반 맞춤 상담 요령]:\n${customCounselAdvice}\n\n위 요령에 맞추어 선생님이 가장 고민하는 스트레스 분야를 최우선으로 깊게 헤아려 주시고, 그에 따른 특별 힐링 상담 기법을 다정하게 적용해 주세요.`;
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents,
      config: {
        systemInstruction: dynamicSystemInstruction,
        temperature: 0.7,
      },
    });

    const reply = response.text || "죄송해요, 마음의 귀를 여는 중 잠시 바람이 불었나 봐요. 다시 한 번 말씀해 주시겠어요?";
    res.json({ reply });
  } catch (error: any) {
    console.error("Gemini Chat Error:", error);
    res.status(500).json({ error: error.message || "상담사와의 연결이 매끄럽지 않습니다." });
  }
});

// API 2: Vent prescription endpoint (마음 대나무숲 위로 처방전)
app.post("/api/vent", async (req, res) => {
  try {
    const { ventContent, category } = req.body;
    if (!ventContent) {
      return res.status(400).json({ error: "털어놓으실 내용이 비어 있습니다." });
    }

    const ai = getGeminiClient();

    const prompt = `
    [교사의 털어놓기]
    카테고리: ${category || "일반 고충"}
    고민 내용: "${ventContent}"

    이 교사의 외침에 깊이 공감하고, 그 고충에 맞춘 "따뜻한 손편지 처방전"을 정성스레 작성해 주세요.
    출력 결과는 다음 JSON 형식으로 정확히 작성해 주세요. 마크다운 기호 없이 순수한 JSON만 반환해 주세요.

    반환할 JSON 구조:
    {
      "letterTitle": "편지의 제목 (예: 상처받은 마음을 위한 포근한 허그)",
      "letterBody": "선생님께 드리는 위로와 지지의 마음이 가득 담긴 편지 내용 (2~3문단 정도로 깊이 있고 진정성 있는 어조로)",
      "prescription": [
        "오늘 당장 실천할 수 있는 마음 치유 행동 1 (예: 퇴근길에 내가 좋아하는 노래 한 곡 듣기)",
        "오늘 당장 실천할 수 있는 마음 치유 행동 2 (예: 학부모 전화 벨소리를 귀여운 벨소리로 바꾸기)",
        "오늘 당장 실천할 수 있는 마음 치유 행동 3"
      ],
      "healingQuote": "이 상황에 어울리는 한 줄의 힐링 문장 (예: '선생님은 이미 충분히 훌륭한 교사이고, 그 이전에 소중한 존재입니다.')"
    }
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        temperature: 0.8,
        systemInstruction: COUNSELING_SYSTEM_INSTRUCTION + "\n반드시 요청된 JSON 구조를 충실히 따라서 유효한 JSON 형식으로만 응답해야 합니다.",
      },
    });

    const resultText = response.text || "{}";
    try {
      const parsed = JSON.parse(resultText);
      res.json(parsed);
    } catch (parseErr) {
      console.error("JSON parse error, raw response was:", resultText);
      // Fallback in case JSON structure isn't perfect
      res.json({
        letterTitle: "지친 하루를 보낸 선생님께",
        letterBody: "오늘 하루도 교실이라는 치열한 공간에서 온 마음을 다해 버텨내시느라 정말 고생 많으셨습니다. 선생님의 수고와 희생은 절대 헛되지 않으며, 누군가의 삶에 보이지 않는 따뜻한 씨앗이 되었을 것입니다. 지금은 잠시 무거운 짐을 내려놓고 스스로의 숨소리에 귀 기울여 보세요.",
        prescription: [
          "오늘 하루는 퇴근 후 학교 업무와 관련된 생각 완전히 끄기",
          "나를 위해 따뜻한 허브차나 맛있는 디저트 선물하기",
          "눈을 감고 1분 동안 천천히 심호흡하기"
        ],
        healingQuote: "완벽하지 않아도 괜찮습니다. 선생님이 건강하고 행복한 것이 가장 중요합니다."
      });
    }
  } catch (error: any) {
    console.error("Gemini Vent Error:", error);
    res.status(500).json({ error: error.message || "처방전을 조제하는 중 오류가 발생했습니다." });
  }
});

// API 3: Burnout / Stress Diagnosis
app.post("/api/diagnose", async (req, res) => {
  try {
    const { scores, answers } = req.body;
    // scores: { exhaustion: number, relations: number, admin: number }
    // answers: array of answers

    if (!scores) {
      return res.status(400).json({ error: "점수 데이터가 없습니다." });
    }

    const ai = getGeminiClient();

    const prompt = `
    교사의 스트레스/번아웃 상세 분석 요청:
    - 감정적 탈진(업무 피로도) 점수: ${scores.exhaustion} / 10
    - 대인 관계 스트레스(학부모/학생 갈등) 점수: ${scores.relations} / 10
    - 업무 과부하(행정 및 기타 압박) 점수: ${scores.admin} / 10

    위 점수 분석 결과를 바탕으로 교사에게 깊은 공감을 건네고, 이 상태를 다스리기 위한 전문적인 피드백을 주세요.
    결과는 다음 JSON 형식으로 정확하게 반환하세요.

    반환할 JSON 구조:
    {
      "statusTitle": "선생님의 현재 마음 상태를 표현하는 짧은 요약 (예: '마음의 신호등에 빨간불이 켜진 상태')",
      "overallAnalysis": "전반적인 스트레스 수준과 점수에 대한 깊이 있는 심리 상담 분석 (따뜻하고 설득력 있는 어조로)",
      "exhaustionFeedback": "감정적 탈진 부문에 대한 공감과 극복 조언",
      "relationsFeedback": "민원 및 대인 갈등에 대한 마음 가짐 및 바운더리(경계선) 설정 조언",
      "adminFeedback": "과도한 행정 업무 속에서 내 에너지를 아끼는 꿀팁",
      "copingStrategy": "선생님을 위한 특별 심리 솔루션 가이드라인"
    }
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        temperature: 0.7,
        systemInstruction: COUNSELING_SYSTEM_INSTRUCTION + "\n반드시 요청된 JSON 구조를 완벽하게 만족하는 JSON 형식으로 응답하십시오.",
      },
    });

    const resultText = response.text || "{}";
    try {
      const parsed = JSON.parse(resultText);
      res.json(parsed);
    } catch (parseErr) {
      console.error("Diagnosis JSON parse error, raw was:", resultText);
      res.json({
        statusTitle: "마음의 충전이 시급한 가을 숲 상태",
        overallAnalysis: "현재 정서적 에너지가 많이 소진된 상태입니다. 나보다 타인의 요구를 먼저 챙기시느라 스스로를 돌보는 데 지치셨을 수 있습니다. 이제는 속도를 줄이고 나에게 쉴 틈을 주어야 할 때입니다.",
        exhaustionFeedback: "지친 몸과 마음은 휴식을 갈구하고 있습니다. 주말에는 완전히 휴식을 취하며 정서적 에너지를 회복하세요.",
        relationsFeedback: "모든 민원을 완벽하게 해결할 수는 없습니다. 학부모와 나 사이에 건강한 정서적 경계선을 그어 스스로를 보호하는 것이 필요합니다.",
        adminFeedback: "중요도와 시급성을 따져 에너지를 분배하시고, 쳐내야 할 일은 과감히 힘을 빼고 처리하세요.",
        copingStrategy: "하루 10분 온전한 침묵 유지하기, 일기장에 힘든 점을 쏟아낸 후 찢어 버리기"
      });
    }
  } catch (error: any) {
    console.error("Gemini Diagnose Error:", error);
    res.status(500).json({ error: error.message || "자가 진단 분석 도중 문제가 발생했습니다." });
  }
});

// Setup Vite or Static File Serving
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

// lifo-app/app/chat/page.tsx
// 중요: 이 파일이 'lifo-app/app/chat/page.tsx' 경로에 정확히 존재하는지 확인하세요.
// 중요: 이 파일의 맨 첫 줄에 '"use client";' 지시어가 정확히 있는지 확인하세요.
"use client"; // Next.js App Router를 사용하는 경우 이 줄을 추가해야 합니다.

import { useState, useEffect, useRef } from "react";
import { auth, db, app } from "@/lib/firebase"; // Firebase 인증, Firestore 인스턴스, Firebase 앱 인스턴스 임포트
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  serverTimestamp, 
  Timestamp 
} from "firebase/firestore"; // Firestore 관련 함수 및 타입 임포트
import { 
  User, 
  onAuthStateChanged,         // Firebase 인증 상태 변경 리스너
  signInAnonymously           // 익명 로그인 함수
  // signInWithCustomToken은 이제 사용하지 않으므로 임포트에서 제거합니다.
} from "firebase/auth"; // Firebase 인증 관련 함수 및 User 타입 임포트

// 대화 데이터의 구조를 정의하는 인터페이스
interface Conversation {
  id: string; // Firestore 문서 ID (읽기 전용)
  user_id: string; // 대화한 사용자 ID
  user_message: string; // 사용자의 메시지 내용
  ai_response: string; // AI의 응답 내용
  created_at: number; // 대화 생성 시간 (밀리초 단위의 타임스탬프)
}

/**
 * 채팅 페이지 컴포넌트입니다.
 * 사용자의 메시지를 받아 AI에게 전달하고, 대화 기록을 Firebase Firestore에 저장하며 표시합니다.
 * 또한, '자기서사 요약' 기능을 제공합니다.
 */
export default function ChatPage() {
  // 상태 변수 정의
  const [input, setInput] = useState("");                     // 사용자 입력 필드의 값
  const [conversations, setConversations] = useState<Conversation[]>([]); // 모든 대화 기록 배열
  const [currentUser, setCurrentUser] = useState<User | null>(null);     // 현재 로그인된 Firebase 사용자 객체
  const [loading, setLoading] = useState(true);               // 앱 로딩 상태 (초기 인증 및 데이터 로딩)
  const [error, setError] = useState<string | null>(null);   // 에러 메시지 (발생 시 사용자에게 표시)

  // 메시지 스크롤을 위한 Ref
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Firebase 앱 인스턴스에서 직접 app.options.appId를 가져옵니다.
  // 이 값은 lib/firebase.ts에서 NEXT_PUBLIC_FIREBASE_APP_ID 환경 변수로 설정됩니다.
  const firebaseAppId = app.options.appId; 

  /**
   * 컴포넌트 마운트 시 사용자 인증을 설정하고 Firestore에서 기존 대화를 불러옵니다.
   * 인증 상태 변경을 감지하고, 사용자가 로그인되면 해당 사용자의 대화 기록을 실시간으로 구독합니다.
   */
  useEffect(() => {
    console.log("ChatPage useEffect: Setting up auth and firestore..."); // 디버깅 로그

    const setupAuthAndFirestore = async () => {
      setLoading(true);
      setError(null);

      // Firebase 인스턴스(auth, db)가 유효한지 확인합니다.
      if (!auth || !db || !firebaseAppId) { // firebaseAppId도 유효성 검사 추가
        console.error("Firebase 인스턴스가 유효하지 않거나 앱 ID를 가져올 수 없습니다. auth:", auth, "db:", db, "appId:", firebaseAppId);
        setError("Firebase가 초기화되지 않았거나 앱 ID를 찾을 수 없습니다. 잠시 후 다시 시도해주세요.");
        setLoading(false);
        return;
      }

      try {
        // Firebase 인증 상태 변경 리스너를 설정합니다.
        // 사용자가 로그인/로그아웃될 때마다 호출됩니다.
        const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
          if (user) {
            // 사용자가 로그인된 경우
            console.log("User authenticated:", user.uid);
            setCurrentUser(user); // 현재 사용자 상태 업데이트
            const userId = user.uid;

            // Firestore에서 현재 사용자의 대화 기록을 실시간으로 불러옵니다.
            // 경로: artifacts/{firebaseAppId}/users/{userId}/conversations
            const conversationsCollectionRef = collection(db, `artifacts/${firebaseAppId}/users/${userId}/conversations`);
            // 'created_at' 필드를 기준으로 오름차순 정렬하여 최신 대화가 아래에 오도록 합니다.
            const q = query(conversationsCollectionRef, orderBy("created_at", "asc"));

            // onSnapshot을 사용하여 실시간으로 데이터 변경을 감지하고 UI를 업데이트합니다.
            const unsubscribeFirestore = onSnapshot(q, (snapshot) => {
              console.log("Firestore snapshot received.");
              const fetchedConversations: Conversation[] = [];
              snapshot.forEach((doc) => {
                const data = doc.data();
                // Firestore Timestamp 객체를 JavaScript Date 객체 또는 숫자로 변환합니다.
                // serverTimestamp()로 저장된 값은 Timestamp 객체로 오므로 toMillis() 사용.
                const createdAt = data.created_at instanceof Timestamp ? data.created_at.toMillis() : data.created_at;
                
                fetchedConversations.push({
                  id: doc.id,
                  user_id: data.user_id,
                  user_message: data.user_message,
                  ai_response: data.ai_response,
                  created_at: createdAt,
                });
              });
              setConversations(fetchedConversations); // 대화 기록 상태 업데이트
              setLoading(false); // 로딩 완료
            }, (firestoreError) => {
              // Firestore 데이터 불러오기 오류 처리
              console.error("Firestore 데이터 불러오기 오류:", firestoreError);
              setError(`대화 기록 불러오기 오류: ${firestoreError.message}`);
              setLoading(false);
            });

            // 컴포넌트 언마운트 시 Firestore 리스너를 해제하여 메모리 누수를 방지합니다.
            return () => unsubscribeFirestore();

          } else {
            // 사용자가 로그인되지 않은 경우 (새로운 세션 또는 로그아웃)
            console.log("No user, attempting anonymous sign-in.");
            try {
              // 익명 로그인만 시도 (Canvas 특정 토큰 signInWithCustomToken 로직 제거)
              await signInAnonymously(auth);
              console.log("Signed in anonymously.");
            } catch (authError: unknown) { 
              // 익명 로그인 오류 처리
              console.error("Firebase 인증 오류:", authError);
              setError(`인증 오류: ${authError instanceof Error ? authError.message : String(authError)}. Firebase 설정을 확인하세요.`);
              setLoading(false);
            }
          }
        });

        // 컴포넌트 언마운트 시 Firebase 인증 리스너를 해제합니다.
        return () => unsubscribeAuth();

      } catch (err: unknown) {
        // 초기 설정(useEffect 자체)에서 발생하는 일반적인 오류 처리
        console.error("앱 초기 설정 오류:", err);
        setError(`앱 초기화 중 오류 발생: ${err instanceof Error ? err.message : String(err)}`);
        setLoading(false);
      }
    };

    setupAuthAndFirestore(); // 설정 함수 실행
  }, [firebaseAppId]); // `firebaseAppId`가 변경될 때마다 `useEffect`를 다시 실행

  /**
   * 'conversations' 상태가 업데이트될 때마다 채팅 스크롤을 맨 아래로 이동시킵니다.
   * 최신 메시지가 항상 보이도록 합니다.
   */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversations]);

  /**
   * 메시지 전송 핸들러 함수입니다.
   * 사용자의 메시지를 AI에게 보내고, 그 응답과 함께 Firestore에 대화 기록을 저장합니다.
   */
  const handleSend = async () => {
    // 입력된 메시지가 없거나 사용자 인증이 되지 않은 경우 오류 처리
    if (!input.trim() || !currentUser) {
      setError("메시지를 입력하거나 사용자 인증이 필요합니다.");
      return;
    }

    setLoading(true); // 메시지 전송 시작 시 로딩 상태로 설정
    setError(null);   // 이전 오류 메시지 초기화
    
    const userMessage = input; // 현재 사용자 메시지 저장
    setInput("");              // 입력 필드 초기화

    // Firebase 데이터베이스 인스턴스가 유효한지 다시 확인
    if (!db) {
      setError("Firebase 데이터베이스가 초기화되지 않았습니다.");
      setLoading(false);
      return;
    }

    try {
      console.log("Sending message to AI and Firestore...");

      // 1. AI에게 전달할 이전 대화 기록 준비
      // Firestore 'Conversation' 타입에서 OpenAI API Route가 필요한 'user_message'와 'ai_response'만 추출합니다.
      const previousMessagesForAI = conversations.map(c => ({
        user_message: c.user_message,
        ai_response: c.ai_response
      }));

      // 2. /api/chat API Route를 호출하여 AI 응답 받기
      // '감정 인터뷰' 모드임을 나타내는 'promptType: interview'를 전송합니다.
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          currentMessage: userMessage, 
          previousConversations: previousMessagesForAI,
          promptType: 'interview' // <-- promptType을 'interview'로 명확히 지정
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP 오류: ${response.status}`);
      }

      const data = await response.json();
      const aiResponse = data.aiResponse;
      console.log("AI Response received from API Route (interview):", aiResponse);

      // 3. 사용자 메시지와 AI 응답을 Firestore에 저장합니다.
      const userId = currentUser.uid;
      const conversationsCollectionRef = collection(db, `artifacts/${firebaseAppId}/users/${userId}/conversations`);

      await addDoc(conversationsCollectionRef, {
        user_id: userId,
        user_message: userMessage,
        ai_response: aiResponse,
        created_at: serverTimestamp(), // Firebase 서버의 정확한 타임스탬프 사용
      });
      console.log("Message saved to Firestore.");

    } catch (err: unknown) {
      // 메시지 전송 및 AI 응답 처리 중 발생하는 오류를 사용자에게 표시
      console.error("메시지 전송 오류:", err);
      setError(`메시지 전송 중 오류 발생: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false); // 메시지 전송 완료 후 로딩 상태 해제
    }
  };

  /**
   * '자기서사 요약' 요청 핸들러 함수입니다.
   * 현재까지의 모든 대화 기록을 바탕으로 AI에게 자기서사 요약을 요청합니다.
   */
  const requestSelfNarrativeSummary = async () => {
    // 요약할 대화 기록이 없거나 사용자 인증이 되지 않은 경우 오류 처리
    if (!currentUser || conversations.length === 0) {
      setError("요약할 대화 기록이 없거나 사용자 인증이 필요합니다.");
      return;
    }

    setLoading(true); // 요약 요청 시작 시 로딩 상태로 설정
    setError(null);   // 이전 오류 메시지 초기화

    try {
      console.log("Requesting self-narrative summary...");

      // 요약에 필요한 모든 대화 기록을 previousConversations로 전달
      const allConversationsForSummary = conversations.map(c => ({
        user_message: c.user_message,
        ai_response: c.ai_response
      }));

      // '자기서사 요약' 모드임을 나타내는 'promptType: summary'를 전송합니다.
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentMessage: "", // 요약 요청 프롬프트는 API Route에서 직접 구성되므로 여기서는 비워둡니다.
          previousConversations: allConversationsForSummary,
          promptType: 'summary' // <-- promptType을 'summary'로 명확히 지정
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP 오류: ${response.status}`);
      }

      const data = await response.json();
      const summary = data.aiResponse;
      console.log("Self-Narrative Summary received:", summary);

      // 요약된 자기서사를 사용자에게 alert로 표시합니다. (실제 앱에서는 더 나은 UI 필요)
      alert(`오늘의 자기서사:\n\n${summary}`);

    } catch (err: unknown) {
      // 자기서사 요약 요청 중 발생하는 오류를 사용자에게 표시
      console.error("자기서사 요약 요청 오류:", err);
      setError(`자기서사 요약 중 오류 발생: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false); // 요약 요청 완료 후 로딩 상태 해제
    }
  };

  // 앱 로딩 중이거나 사용자가 아직 인증되지 않은 경우 로딩 메시지 표시
  if (loading && !currentUser) {
    return <div className="p-6 text-center text-gray-600">앱을 불러오는 중입니다...</div>;
  }

  // 메인 UI 렌더링
  return (
    <div className="p-6 max-w-2xl mx-auto bg-white rounded-lg shadow-md">
      <h1 className="text-2xl font-bold text-center mb-6 text-gray-800">오늘 하루, 어땠나요?</h1>

      {/* 현재 사용자 ID 표시 (인증된 경우) */}
      {currentUser && (
        <div className="text-sm text-gray-500 mb-4 text-center">
          사용자 ID: <span className="font-mono bg-gray-100 p-1 rounded">{currentUser.uid}</span>
        </div>
      )}

      {/* 오류 메시지 표시 */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
          <strong className="font-bold">오류: </strong>
          <span className="block sm:inline">{error}</span>
        </div>
      )}

      {/* 대화 기록 표시 영역 */}
      <div className="space-y-4 mb-6 h-96 overflow-y-auto border p-4 rounded-lg bg-gray-50">
        {/* 대화 기록이 없는 경우 메시지 표시 */}
        {conversations.length === 0 && !loading && (
          <p className="text-center text-gray-500">아직 대화 기록이 없습니다. 첫 질문을 시작해보세요!</p>
        )}
        {/* 각 대화 항목 맵핑 및 표시 */}
        {conversations.map((conv) => (
          <div key={conv.id} className="flex flex-col space-y-1">
            {/* 사용자 메시지 */}
            <div className="bg-blue-100 p-3 rounded-lg self-end max-w-[80%]">
              <span className="font-semibold text-blue-800">🙋 사용자: </span>
              {conv.user_message}
            </div>
            {/* AI 응답 */}
            <div className="bg-green-100 p-3 rounded-lg self-start max-w-[80%]">
              <span className="font-semibold text-green-800">🤖 AI: </span>
              {conv.ai_response}
            </div>
            {/* 메시지 전송 시간 */}
            <div className="text-xs text-gray-400 self-end">
              {conv.created_at ? new Date(conv.created_at).toLocaleString() : '날짜 없음'}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} /> {/* 스크롤 위치 조정을 위한 빈 div */}
        {/* 메시지 전송 중 로딩 표시 */}
        {loading && currentUser && (
          <div className="text-center text-gray-500">메시지를 보내는 중...</div>
        )}
      </div>

      {/* 메시지 입력 필드와 전송 버튼 */}
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="flex-1 border border-gray-300 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="오늘의 감정을 입력해보세요..."
          onKeyPress={(e) => {
            if (e.key === "Enter") {
              handleSend();
            }
          }}
          disabled={loading} // 로딩 중에는 입력 필드 비활성화
        />
        <button
          onClick={handleSend}
          className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 transition-all duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-blue-300"
          disabled={loading} // 로딩 중에는 버튼 비활성화
        >
          보내기
        </button>
      </div>

      {/* 새로운 '자기서사 요약' 버튼 추가 */}
      {conversations.length > 0 && ( // 대화 기록이 있을 때만 버튼 표시
        <div className="mt-4 text-center">
          <button
            onClick={requestSelfNarrativeSummary} // 이 함수가 요약 요청을 처리합니다.
            className="px-6 py-3 bg-purple-600 text-white font-semibold rounded-lg shadow-md hover:bg-purple-700 transition-all duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-purple-300"
            disabled={loading}
          >
            오늘의 자기서사 요약하기
          </button>
        </div>
      )}
    </div>
  );
}
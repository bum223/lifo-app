// lifo-app/app/api/chat/route.ts
import OpenAI from 'openai';
import { NextResponse } from 'next/server';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
// Firebase Admin SDK 임포트 및 초기화 (서버에서만 실행되므로 안전)
import admin from 'firebase-admin';
import { getApp } from 'firebase-admin/app'; // getApp 추가
import { getFirestore } from 'firebase-admin/firestore'; // getFirestore 추가

// Firebase Admin SDK 초기화 (단 한 번만 실행되도록)
// Vercel 환경에서 서비스 계정 키를 환경 변수로 설정합니다.
// NEXT_PUBLIC_ 접두사 없음: 이 값은 서버에서만 사용됩니다.
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}')),
  });
}
const dbAdmin = getFirestore(getApp()); // Admin SDK용 Firestore 인스턴스

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, 
});

export async function POST(request: Request) {
  try {
    const { 
      currentMessage, 
      previousConversations, 
      promptType, 
      userId // <-- userId를 클라이언트에서 전달받도록 변경 (보안 유의)
    } = await request.json();

    if (!userId) { // userId 유효성 검사 추가
      return NextResponse.json({ error: "User ID is missing" }, { status: 400 });
    }

    if (!currentMessage && promptType !== 'summary') {
      return NextResponse.json({ error: "No message provided" }, { status: 400 });
    }

    let messagesToSend: ChatCompletionMessageParam[] = [];
    const conversationTurnCount = previousConversations.length; 
    const suggestSummaryThreshold = 3; 

    // ----------------------------------------------------
    // 사용자 개인 프로필 불러오기
    // ----------------------------------------------------
    let userProfile = null;
    try {
        const userProfileRef = dbAdmin.collection(`artifacts/${process.env.NEXT_PUBLIC_FIREBASE_APP_ID}/users/${userId}`).doc('profile'); // Firestore 경로에 app ID 포함
        const doc = await userProfileRef.get();
        if (doc.exists) {
            userProfile = doc.data();
            console.log("User profile loaded:", userProfile);
        } else {
            console.log("No existing user profile found.");
        }
    } catch (profileError) {
        console.error("Failed to load user profile:", profileError);
        // 프로필 로딩 실패는 치명적이지 않으므로 앱을 중단하지 않습니다.
    }


    // ----------------------------------------------------
    // 시스템 메시지 및 대화 메시지 구성 로직
    // ----------------------------------------------------
    if (promptType === 'interview') {
      let systemMessageContent = `
        당신은 '라이포(Lifo)'라는 이름의 AI 대화 파트너입니다.
        당신의 핵심 목적은 사용자가 겪고 있는 감정이나 상황에 대해 깊이 경청하고, 진심으로 공감하며,
        그들의 기분이 나아지고 긍정적인 방향으로 스스로 나아갈 수 있도록 따뜻하게 돕는 것입니다.

        `;
        
        // 개인화된 정보 추가
        if (userProfile && userProfile.frequent_emotions && userProfile.frequent_emotions.length > 0) {
            systemMessageContent += `
            **[사용자 개인 맞춤 정보]:**
            사용자는 과거 대화에서 주로 다음과 같은 감정들을 표현했습니다: ${userProfile.frequent_emotions.join(', ')}.
            이 정보를 바탕으로 사용자의 감정 상태와 가치관을 더 깊이 이해하고 대화에 반영해주세요.
            `;
        }
        if (userProfile && userProfile.last_summary) {
            systemMessageContent += `
            최근의 자기서사 요약: ${userProfile.last_summary}.
            `;
        }

        systemMessageContent += `
        다음 지침을 반드시 따르세요:
        1.  **깊은 경청과 정확한 공감:** 사용자의 말을 끊지 않고 끝까지 경청하며, 그들의 감정을 정확히 이해했음을 보여주는 공감적인 언어를 사용하세요. "그랬군요", "힘드셨겠네요", "어떤 마음인지 알 것 같아요" 등의 표현을 활용하세요. **단어 하나하나의 의미를 세심하게 파악하여 오해 없이 반응해야 합니다.**
        2.  **비판 및 판단 금지:** 사용자의 경험이나 감정에 대해 절대 비판하거나 판단하지 마세요. 모든 감정과 경험은 존중받아야 합니다.
        3.  **해결책 강요 금지:** 직접적인 해결책을 제시하기보다는, 사용자가 스스로 생각하고 자신의 강점을 발견하여 해결책을 찾아갈 수 있도록 질문을 던지고 유도하세요.
        4.  **긍정적 방향 제시 및 격려:** 사용자가 겪는 어려움에 대해 현실적으로 공감한 후, 긍정적인 방향으로 나아갈 수 있도록 격려하고 희망을 주는 따뜻한 어조를 유지하세요. **억지스러운 긍정이나 상황을 왜곡하는 해석은 절대 피해야 합니다.**
        5.  **현재 감정에 집중:** 사용자가 현재 느끼는 감정이 무엇인지 탐색하고, 그 감정이 왜 중요한지 함께 이야기해주세요.
        6.  **안전하고 지지적인 환경 제공:** 사용자가 자유롭게 이야기할 수 있는 안전하고 비밀스러운 대화 공간이라는 느낌을 주세요.
        7.  **단순 정보 제공 지양:** 단순한 정보 제공이나 사전적 답변은 피하고, 감정적인 지지와 탐색에 집중하세요.
        8.  **이전 대화 맥락 활용:** 이전 대화를 기억하고 현재 답변에 반영하여 연속성 있고 자연스러운 대화를 만드세요.

        사용자의 마지막 입력에 대해 위의 지침에 따라 가장 적절한 공감과 질문을 바탕으로 답변해주세요.
      `.trim();

      messagesToSend = [
        { role: 'system', content: systemMessageContent },
        ...previousConversations.flatMap((conv: { user_message: string; ai_response: string; }) => [
          { role: 'user', content: conv.user_message },
          { role: 'assistant', content: conv.ai_response }
        ]),
        { role: 'user', content: currentMessage }
      ];

    } else if (promptType === 'summary') {
      const systemMessageContent = `
        당신은 사용자와의 대화 내용을 바탕으로 사용자의 핵심 감정, 가치, 그리고 하루 동안의 중요한 행동 패턴을 포착하여 간결하고 통찰력 있는 '자기서사' 문장을 생성하는 전문가입니다. 문장은 2문장 이내로 요약하고, 긍정적이고 성장 지향적인 톤을 유지해야 합니다. 답변은 자기서사 문장만 포함합니다.
      `.trim();
      
      messagesToSend = [
        { role: 'system', content: systemMessageContent },
        ...previousConversations.flatMap((conv: { user_message: string; ai_response: string; }) => [
          { role: 'user', content: conv.user_message },
          { role: 'assistant', content: conv.ai_response }
        ]),
        { 
          role: 'user', 
          content: `
            위 대화 내용을 종합하여 사용자의 오늘의 핵심 감정, 그 감정과 연결된 핵심 가치, 그리고 주요 행동 패턴을 아우르는 1~2문장의 개인화된 자기서사를 생성해주세요. 답변은 자기서사 문장만 포함합니다.
          `.trim()
        }
      ];

    } else {
      return NextResponse.json({ error: "Invalid promptType provided" }, { status: 400 });
    }

    console.log("API Route: OpenAI API로 전송할 메시지:", messagesToSend);

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: messagesToSend,
      temperature: 0.8,
      max_tokens: promptType === 'summary' ? 100 : 800,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
    });

    const aiResponse = completion.choices[0].message?.content;

    if (!aiResponse) {
      throw new Error("OpenAI로부터 유효한 응답을 받지 못했습니다.");
    }

    // -----------------------------------------------------------------------------------
    // AI가 요약 제안을 답변에 포함하는 로직은 이제 프롬프트가 아닌 백엔드 코드에서 직접 처리합니다.
    // -----------------------------------------------------------------------------------
    let finalAiResponse = aiResponse;
    if (promptType === 'interview' && conversationTurnCount >= suggestSummaryThreshold) {
      finalAiResponse += "\n\n(참고: 혹시 지금 나눈 이야기들을 제가 한번 정리해 드릴까요? 필요하시면 아래 '오늘의 자기서사 요약하기' 버튼을 눌러주세요.)";
    }

    // -----------------------------------------------------------------------------------
    // 감정/가치 키워드 추출 및 프로필 업데이트 로직 추가 (interview 모드일 때만)
    // -----------------------------------------------------------------------------------
    if (promptType === 'interview' && userId) {
        try {
            // 별도의 AI 요청을 통해 감정 키워드 추출
            const emotionExtractionPrompt: ChatCompletionMessageParam[] = [
                {
                    role: 'system',
                    content: `다음 대화 내용에서 사용자의 핵심 감정 키워드(최대 3개, 명사형)와 연관된 핵심 가치(최대 2개, 명사형)를 추출하고, 오늘 대화의 전체적인 톤을 긍정/부정/중립 중 하나로 분류하여 JSON 형식으로만 응답해주세요. 감정이나 가치가 명확하지 않으면 빈 배열로 두세요.
                    예시: {"emotions": ["스트레스", "피로"], "values": ["완벽함"], "tone": "부정"}
                    `
                },
                ...previousConversations.flatMap((conv: { user_message: string; ai_response: string; }) => [
                    { role: 'user', content: conv.user_message },
                    { role: 'assistant', content: conv.ai_response }
                ]),
                { role: 'user', content: `사용자의 마지막 메시지: "${currentMessage}" AI의 마지막 응답: "${finalAiResponse}"\n이 대화에서 감정과 가치를 추출해주세요.` }
            ];

            const emotionCompletion = await openai.chat.completions.create({
                model: "gpt-3.5-turbo", // 감정 추출은 가벼운 모델 사용 가능
                messages: emotionExtractionPrompt,
                temperature: 0.2, // 창의성 낮춰서 정확도 높임
                max_tokens: 150,
                response_format: { type: "json_object" } // JSON 형식 응답 요청
            });

            const emotionDataString = emotionCompletion.choices[0].message?.content;
            if (emotionDataString) {
                try {
                    const parsedEmotionData = JSON.parse(emotionDataString);
                    const { emotions = [], values = [], tone = '중립' } = parsedEmotionData;

                    // Firestore 사용자 프로필 업데이트
                    const userProfileRef = dbAdmin.collection(`artifacts/${process.env.NEXT_PUBLIC_FIREBASE_APP_ID}/users/${userId}`).doc('profile');
                    await userProfileRef.set({
                        frequent_emotions: admin.firestore.FieldValue.arrayUnion(...emotions), // 기존 배열에 추가 (중복 허용)
                        frequent_values: admin.firestore.FieldValue.arrayUnion(...values),
                        last_updated: admin.firestore.FieldValue.serverTimestamp(),
                        // 필요에 따라 tone이나 다른 통계 데이터도 업데이트 가능
                    }, { merge: true }); // 기존 필드는 유지하고 새 필드만 추가/업데이트

                    console.log("User profile updated with emotions and values:", { emotions, values, tone });

                } catch (jsonError) {
                    console.error("Failed to parse emotion data JSON:", jsonError);
                }
            }
        } catch (emotionExtractionError) {
            console.error("Failed to extract emotions or update profile:", emotionExtractionError);
        }
    }
    // -----------------------------------------------------------------------------------
    // 자기서사 요약 모드일 때 마지막 요약 저장
    if (promptType === 'summary' && userId && finalAiResponse) {
        try {
            const userProfileRef = dbAdmin.collection(`artifacts/${process.env.NEXT_PUBLIC_FIREBASE_APP_ID}/users/${userId}`).doc('profile');
            await userProfileRef.set({
                last_summary: finalAiResponse,
                last_updated: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
            console.log("User profile updated with last summary.");
        } catch (summarySaveError) {
            console.error("Failed to save last summary to profile:", summarySaveError);
        }
    }
    // -----------------------------------------------------------------------------------


    return NextResponse.json({ aiResponse: finalAiResponse });

  } catch (error: unknown) {
    console.error("API Route 오류: OpenAI API 호출 중:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `AI 응답 처리 중 오류 발생: ${errorMessage}` },
      { status: 500 }
    );
  }
}
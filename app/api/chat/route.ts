// lifo-app/app/api/chat/route.ts
import OpenAI from 'openai';
import { NextResponse } from 'next/server';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore'; 

// Firebase Admin SDK 초기화 (서버리스 환경에서 가장 안정적인 패턴)
function getFirebaseAdminApp(): admin.app.App {
  // admin.app.getApps().length 대신 admin.apps.length를 사용합니다.
  // admin.apps는 이미 초기화된 Firebase 앱 인스턴스 배열입니다.
  if (admin.apps.length === 0) { // <-- 이 부분을 수정합니다.
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

    if (!serviceAccountKey) {
      console.error("FIREBASE_SERVICE_ACCOUNT_KEY environment variable is not set. Admin SDK cannot be initialized.");
      throw new Error("Server configuration error: Firebase Service Account Key is missing.");
    }
    try {
        const parsedCredential = JSON.parse(serviceAccountKey);
        return admin.initializeApp({
            credential: admin.credential.cert(parsedCredential),
        });
    } catch (parseError) {
        console.error(`Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY: ${parseError}`);
        throw new Error(`Server configuration error: Invalid Firebase Service Account Key format.`);
    }
  } else {
    // 이미 초기화된 앱이 있다면, 기본 앱 인스턴스를 가져와 재사용합니다.
    return admin.app(); 
  }
}

const adminApp = getFirebaseAdminApp();
const dbAdmin = getFirestore(adminApp);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, 
});

export async function POST(request: Request) {
  try {
    const { 
      currentMessage, 
      previousConversations, 
      promptType, 
      userId 
    } = await request.json();

    if (!userId) {
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
    interface UserProfileData {
      frequent_emotions?: string[];
      frequent_values?: string[];
      last_summary?: string;
      last_updated?: admin.firestore.FieldValue;
      // [key: string]: any; // <-- 이 부분을 제거하거나 더 구체적인 타입으로 대체합니다.
                          // 현재 이 필드가 `any` 오류를 유발할 수 있습니다.
    }
    // userProfile 변수 초기화를 더 명확히 합니다.
    let userProfile: UserProfileData | undefined = undefined; // null 대신 undefined 사용 (optional chaining에 유리)

    try {
        const firebaseAppId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
        if (!firebaseAppId) {
            console.error("NEXT_PUBLIC_FIREBASE_APP_ID is not set in environment variables. User profile features will be limited."); 
        }

        if (firebaseAppId) { 
            const userProfileRef = dbAdmin.collection(`artifacts/${firebaseAppId}/users/${userId}`).doc('profile');
            const doc = await userProfileRef.get();
            if (doc.exists) {
                // doc.data()는 DocumentData를 반환. 이를 명시적으로 UserProfileData로 검증/단언
                const data = doc.data();
                // 데이터 필드를 명시적으로 UserProfileData에 맞게 매핑 또는 검증
                userProfile = {
                    frequent_emotions: Array.isArray(data?.frequent_emotions) ? data.frequent_emotions.map(String) : undefined,
                    frequent_values: Array.isArray(data?.frequent_values) ? data.frequent_values.map(String) : undefined,
                    last_summary: typeof data?.last_summary === 'string' ? data.last_summary : undefined,
                    last_updated: data?.last_updated, // Firebase Timestamp 타입 등 확인 필요
                    // 추가적인 필드가 있다면 여기에 명시
                };
                console.log("User profile loaded:", userProfile);
            } else {
                console.log("No existing user profile found for userId:", userId);
            }
        }
    } catch (profileError: unknown) { // 이 부분은 unknown으로 이미 잘 처리되어 있습니다.
        console.error("Failed to load user profile:", profileError instanceof Error ? profileError.message : String(profileError));
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
        
        // userProfile이 null이 아닌 undefined일 수 있으므로 옵셔널 체이닝 강화
        if (userProfile?.frequent_emotions && Array.isArray(userProfile.frequent_emotions) && userProfile.frequent_emotions.length > 0) {
            systemMessageContent += `
            **[사용자 개인 맞춤 정보]:**
            사용자는 과거 대화에서 주로 다음과 같은 감정들을 표현했습니다: ${userProfile.frequent_emotions.join(', ')}.
            이 정보를 바탕으로 사용자의 감정 상태와 가치관을 더 깊이 이해하고 대화에 반영해주세요.
            `;
        }
        if (userProfile?.last_summary && typeof userProfile.last_summary === 'string') {
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

    let finalAiResponse = aiResponse;
    if (promptType === 'interview' && conversationTurnCount >= suggestSummaryThreshold) {
      finalAiResponse += "\n\n(참고: 혹시 지금 나눈 이야기들을 제가 한번 정리해 드릴까요? 필요하시면 아래 '오늘의 자기서사 요약하기' 버튼을 눌러주세요.)";
    }

    if (promptType === 'interview' && userId) {
        try {
            const firebaseAppId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
            if (!firebaseAppId) {
                console.error("NEXT_PUBLIC_FIREBASE_APP_ID is not set in environment variables for emotion extraction. Skipping profile update."); 
            }

            if (firebaseAppId) { 
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
                    model: "gpt-3.5-turbo",
                    messages: emotionExtractionPrompt,
                    temperature: 0.2,
                    max_tokens: 150,
                    response_format: { type: "json_object" }
                });

                const emotionDataString = emotionCompletion.choices[0].message?.content;
                if (emotionDataString) {
                    try {
                        const parsedEmotionData: { emotions?: string[], values?: string[], tone?: string } = JSON.parse(emotionDataString);
                        const emotions: string[] = Array.isArray(parsedEmotionData.emotions) ? parsedEmotionData.emotions.map(String) : [];
                        const values: string[] = Array.isArray(parsedEmotionData.values) ? parsedEmotionData.values.map(String) : [];
                        const tone: string = typeof parsedEmotionData.tone === 'string' ? parsedEmotionData.tone : '중립';


                        const userProfileRef = dbAdmin.collection(`artifacts/${firebaseAppId}/users/${userId}`).doc('profile');
                        await userProfileRef.set({
                            frequent_emotions: admin.firestore.FieldValue.arrayUnion(...emotions),
                            frequent_values: admin.firestore.FieldValue.arrayUnion(...values),
                            last_updated: admin.firestore.FieldValue.serverTimestamp(),
                            tone_data: admin.firestore.FieldValue.arrayUnion(tone), 
                        }, { merge: true });
                        console.log("User profile updated with emotions and values:", { emotions, values, tone });

                    } catch (jsonError: unknown) { 
                        console.error("Failed to parse emotion data JSON or update profile:", jsonError instanceof Error ? jsonError.message : String(jsonError)); 
                    }
                }
            } else {
                console.warn("Skipping emotion extraction and profile update: Firebase App ID is not available.");
            }
        } catch (emotionExtractionError: unknown) { 
            console.error("Failed to extract emotions or update profile (OpenAI API call or Firestore issue):", emotionExtractionError instanceof Error ? emotionExtractionError.message : String(emotionExtractionError)); 
        }
    }

    if (promptType === 'summary' && userId && finalAiResponse) {
        try {
            const firebaseAppId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID; 
            if (firebaseAppId) {
                const userProfileRef = dbAdmin.collection(`artifacts/${firebaseAppId}/users/${userId}`).doc('profile');
                await userProfileRef.set({
                    last_summary: finalAiResponse,
                    last_updated: admin.firestore.FieldValue.serverTimestamp(),
                }, { merge: true });
                console.log("User profile updated with last summary.");
            } else {
                 console.warn("Skipping summary save: Firebase App ID is not available.");
            }
        } catch (summarySaveError: unknown) { 
            console.error("Failed to save last summary to profile:", summarySaveError instanceof Error ? summarySaveError.message : String(summarySaveError));
        }
    }

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
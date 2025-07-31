// lifo-app/app/api/chat/route.ts
import OpenAI from 'openai';
import { NextResponse } from 'next/server';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions'; // 추가: OpenAI 타입 임포트

// OpenAI 인스턴스를 전역적으로 관리 (API Route는 서버에서 실행되므로 안전)
const openai = new OpenAI({
  // 환경 변수 이름이 OPENAI_API_KEY인지 NEXT_PUBLIC_OPENAI_API_KEY인지 확인하세요.
  // Vercel에서 API Route는 서버리스 함수로 실행되므로 OPENAI_API_KEY만 있으면 됩니다.
  apiKey: process.env.OPENAI_API_KEY, 
});

// POST 요청 핸들러
export async function POST(request: Request) {
  try {
    const { currentMessage, previousConversations } = await request.json();

    if (!currentMessage) {
      return NextResponse.json({ error: "No message provided" }, { status: 400 });
    }

    // 타입 명확화
    const systemMessage: ChatCompletionMessageParam = { // 'any' 대신 ChatCompletionMessageParam 사용
      role: 'system',
      content: '당신은 사용자의 감정을 경청하고 공감하며, 따뜻한 조언과 지지를 제공하는 친절한 대화 파트너입니다. 사용자의 기분을 더 좋게 만들고 긍정적인 방향으로 나아갈 수 있도록 돕는 데 집중해주세요.'
    };

    // previousConversations 배열의 각 요소에 대한 타입을 명시 (예: { user_message: string; ai_response: string; })
    // map 함수의 conv 매개변수에도 타입을 명시
    const historyMessages: ChatCompletionMessageParam[] = previousConversations.flatMap((conv: { user_message: string; ai_response: string; }) => [
      { role: 'user', content: conv.user_message },
      { role: 'assistant', content: conv.ai_response }
    ]);

    const messagesToSend: ChatCompletionMessageParam[] = [ // 'any' 대신 ChatCompletionMessageParam[] 사용
      systemMessage,
      ...historyMessages,
      { role: 'user', content: currentMessage }
    ];

    console.log("API Route: OpenAI API로 전송할 메시지:", messagesToSend);

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: messagesToSend,
      temperature: 0.8,
      max_tokens: 800,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
    });

    const aiResponse = completion.choices[0].message?.content;

    if (!aiResponse) {
      return NextResponse.json({ error: "OpenAI로부터 유효한 응답을 받지 못했습니다." }, { status: 500 });
    }

    return NextResponse.json({ aiResponse });

  } catch (error: any) { // 에러 객체의 타입은 'any'로 두는 경우가 많습니다.
    console.error("API Route 오류: OpenAI API 호출 중:", error);
    return NextResponse.json(
      { error: `AI 응답 처리 중 오류 발생: ${error.message || "알 수 없는 오류"}` },
      { status: 500 }
    );
  }
}
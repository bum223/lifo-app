// lifo-app/app/api/chat/route.ts
import OpenAI from 'openai';
import { NextResponse } from 'next/server';

// OpenAI 인스턴스를 전역적으로 관리 (API Route는 서버에서 실행되므로 안전)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // 서버 사이드에서는 NEXT_PUBLIC_ 접두사 필요 없음
});

// POST 요청 핸들러: 클라이언트로부터 메시지를 받아 OpenAI API 호출 후 응답 반환
export async function POST(request: Request) {
  try {
    const { currentMessage, previousConversations } = await request.json();

    if (!currentMessage) {
      return NextResponse.json({ error: "No message provided" }, { status: 400 });
    }

    // AI의 역할과 지시를 정의하는 시스템 메시지
    const systemMessage: any = {
      role: 'system',
      content: '당신은 사용자의 감정을 경청하고 공감하며, 따뜻한 조언과 지지를 제공하는 친절한 대화 파트너입니다. 사용자의 기분을 더 좋게 만들고 긍정적인 방향으로 나아갈 수 있도록 돕는 데 집중해주세요. 사용자에게 희망을 주고, 스스로 해결책을 찾을 수 있도록 유도하는 것이 목표입니다. 절대 비판하거나 판단하지 마세요.'
    };

    // 이전 대화 기록을 OpenAI API의 'messages' 형식으로 변환합니다.
    const historyMessages: any[] = previousConversations.flatMap((conv: any) => [
      { role: 'user', content: conv.user_message },
      { role: 'assistant', content: conv.ai_response }
    ]);

    // OpenAI API에 전송할 전체 메시지 배열 구성
    const messagesToSend: any[] = [
      systemMessage,
      ...historyMessages,
      { role: 'user', content: currentMessage }
    ];

    console.log("API Route: OpenAI API로 전송할 메시지:", messagesToSend);

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo", // 또는 "gpt-4-turbo" 등
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

  } catch (error: any) {
    console.error("API Route 오류: OpenAI API 호출 중:", error);
    return NextResponse.json(
      { error: `AI 응답 처리 중 오류 발생: ${error.message || "알 수 없는 오류"}` },
      { status: 500 }
    );
  }
}
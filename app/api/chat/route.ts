// lifo-app/app/api/chat/route.ts
import OpenAI from 'openai';
import { NextResponse } from 'next/server';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions'; // 추가: OpenAI 타입 임포트

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, 
});

export async function POST(request: Request) {
  try {
    const { currentMessage, previousConversations } = await request.json();

    if (!currentMessage) {
      return NextResponse.json({ error: "No message provided" }, { status: 400 });
    }

    const systemMessage: ChatCompletionMessageParam = {
      role: 'system',
      content: '당신은 사용자의 감정을 경청하고 공감하며, 따뜻한 조언과 지지를 제공하는 친절한 대화 파트너입니다. 사용자의 기분을 더 좋게 만들고 긍정적인 방향으로 나아갈 수 있도록 돕는 데 집중해주세요.'
    };

    const historyMessages: ChatCompletionMessageParam[] = previousConversations.flatMap((conv: { user_message: string; ai_response: string; }) => [
      { role: 'user', content: conv.user_message },
      { role: 'assistant', content: conv.ai_response }
    ]);

    const messagesToSend: ChatCompletionMessageParam[] = [
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

  } catch (error: unknown) { // <-- 이 부분을 'unknown'으로 변경했습니다.
    console.error("API Route 오류: OpenAI API 호출 중:", error);
    // error가 Error 타입인지 확인하여 메시지를 추출합니다.
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `AI 응답 처리 중 오류 발생: ${errorMessage}` },
      { status: 500 }
    );
  }
}
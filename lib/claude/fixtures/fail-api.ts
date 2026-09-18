import Anthropic from "@anthropic-ai/sdk";

export function throwFailApi(): never {
  throw Anthropic.APIError.generate(
    500,
    {
      type: "error",
      error: {
        type: "api_error",
        message: "테스트용 Anthropic API 장애",
      },
    },
    "테스트용 Anthropic API 장애",
    new Headers(),
  );
}

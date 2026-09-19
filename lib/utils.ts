import { createCn } from "cn/config";

// app/globals.css의 `@utility text-*`(design.md 4절 글자 단계)는 글자색이 아니라 글자 크기다.
// 등록하지 않으면 `text-strong` 같은 색 클래스와 같은 종류로 보고 앞의 것을 지운다.
export const cn = createCn({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "display",
            "h1",
            "h2",
            "h3",
            "body",
            "cell",
            "caption",
            "micro",
            "amount-lg",
            "amount-md",
            "amount-sm",
          ],
        },
      ],
    },
  },
});

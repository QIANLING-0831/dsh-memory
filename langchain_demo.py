"""LangChain + DeepSeek / OpenAI 快速示例
用法:
    1. 在项目目录建 .env 文件(或用记事本),写入你的密钥:
         DEEPSEEK_API_KEY=sk-xxxxxxxx
         OPENAI_API_KEY=sk-xxxxxxxx
    2. 运行:  python langchain_demo.py
"""
import os
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage

load_dotenv()  # 读取同目录下的 .env

deepseek_key = os.getenv("DEEPSEEK_API_KEY")
openai_key = os.getenv("OPENAI_API_KEY")


def chat_demo(llm, name):
    print(f"\n========== {name} ==========")
    resp = llm.invoke([HumanMessage(content="用一句话介绍 LangChain 是什么")])
    print("回答:", resp.content)


if __name__ == "__main__":
    # ===== DeepSeek(API 兼容 OpenAI 格式,只需改 base_url)=====
    if deepseek_key:
        deepseek = ChatOpenAI(
            model="deepseek-chat",          # 或 "deepseek-reasoner"(推理模型)
            api_key=deepseek_key,
            base_url="https://api.deepseek.com",
            temperature=0.7,
        )
        chat_demo(deepseek, "DeepSeek")
    else:
        print("未设置 DEEPSEEK_API_KEY,跳过 DeepSeek 演示")

    # ===== OpenAI =====
    if openai_key:
        gpt = ChatOpenAI(
            model="gpt-4o-mini",            # 按你的账号可用模型调整
            api_key=openai_key,
            temperature=0.7,
        )
        chat_demo(gpt, "OpenAI GPT")
    else:
        print("未设置 OPENAI_API_KEY,跳过 OpenAI 演示")

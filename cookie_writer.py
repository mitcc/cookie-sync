#!/usr/bin/env python3
import sys
import json
import struct
import os

# 动态引入 post_handler（如果存在则引入，不存在不报错）
try:
    from post_handler import handle_post_process
except ImportError:
    handle_post_process = None

# 读取 Chrome 标准输入发来的 JSON 消息
def read_message():
    raw_length = sys.stdin.buffer.read(4)
    if not raw_length or len(raw_length) < 4:
        return None
    message_length = struct.unpack('@I', raw_length)[0]
    message = sys.stdin.buffer.read(message_length).decode('utf-8')
    return json.loads(message)

# 向 Chrome 发送标准输出 JSON 响应
def send_message(message):
    content = json.dumps(message).encode('utf-8')
    sys.stdout.buffer.write(struct.pack('@I', len(content)))
    sys.stdout.buffer.write(content)
    sys.stdout.buffer.flush()

if __name__ == '__main__':
    while True:
        try:
            data = read_message()
            if data is None:
                break

            file_path = data.get('path')
            content = data.get('content')

            if file_path and content is not None:
                expanded_path = os.path.expanduser(file_path)
                os.makedirs(os.path.dirname(os.path.abspath(expanded_path)), exist_ok=True)

                # 1. 正常写入原文件
                with open(expanded_path, 'w', encoding='utf-8') as f:
                    f.write(content)

                # 2. 触发后置处理逻辑（如果存在 post_handler）
                if handle_post_process:
                    try:
                        handle_post_process(expanded_path, content)
                    except Exception as post_err:
                        sys.stderr.write(f"[post_process_error] {post_err}\n")

                send_message({"status": "success", "path": expanded_path})
            else:
                send_message({"status": "error", "message": "参数非法"})
        except Exception as e:
            send_message({"status": "error", "message": str(e)})

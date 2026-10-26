#!/bin/bash
# 腾讯云 Ubuntu 服务器一键部署脚本
# 用法：把整个项目目录上传到服务器后，在项目目录内执行：sudo bash deploy.sh
set -e

APP_DIR=/opt/news-collector
SVC_FILE=/etc/systemd/system/news-server.service

if [ "$(id -u)" -ne 0 ]; then
  echo "请用 root 运行：sudo bash deploy.sh"
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "==> 安装 python3"
  apt-get update -y
  apt-get install -y python3
fi

echo "==> 复制项目文件到 ${APP_DIR}"
mkdir -p "${APP_DIR}"
cp -r server.py static "${APP_DIR}/"

echo "==> 写入并启动 systemd 服务"
cat > "${SVC_FILE}" <<'EOF'
[Unit]
Description=News Collector Server
After=network.target

[Service]
WorkingDirectory=/opt/news-collector
ExecStart=/usr/bin/python3 server.py
Restart=always
RestartSec=3
Environment=PORT=8000

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now news-server
sleep 1
systemctl status news-server --no-pager || true

IP=$(hostname -I | awk '{print $1}')
echo ""
echo "=============================================="
echo "部署完成！访问地址：http://${IP}:8000"
echo "若打不开：去腾讯云控制台 -> 轻量应用服务器 -> 防火墙，放行 TCP 8000"
echo "=============================================="

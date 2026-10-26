# 腾讯云部署指南

## 1. 购买服务器

- 登录腾讯云，进入「轻量应用服务器」。
- 新建实例：地域选离你近的（广州 / 上海等）。
- 镜像选「系统镜像」→ Ubuntu 22.04 LTS。
- 套餐选最低配即可（这个站点很轻量）。

## 2. 初始化

- 记录公网 IP。
- 在控制台「重置密码」设置 root 密码。

## 3. 放行端口（关键，漏了会打不开）

- 控制台 → 该实例 →「防火墙」→ 添加规则：
  - 协议：TCP
  - 端口：8000
  - 来源：0.0.0.0/0（允许所有 IP）

## 4. 部署

方式一（推荐，交给 Codex）：把公网 IP 和 root 密码发给我，我 SSH 上去部署。

方式二（自己部署）：

1. 把项目文件夹上传到服务器（例如 `/root/news-collector`），目录里应有 `server.py`、`static/`、`deploy.sh`。
2. SSH 登录服务器，进入该目录执行：

```bash
sudo bash deploy.sh
```

3. 浏览器访问 `http://公网IP:8000`。

## 5. 常用运维

- 查看状态：`systemctl status news-server`
- 查看日志：`journalctl -u news-server -f`
- 重启服务：`systemctl restart news-server`

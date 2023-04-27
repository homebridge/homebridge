# Introduction

이 프로젝트는 클라우드 서버와 연계한 스마트홈 구성을 목표로 제작되었습니다.

프로젝트를 시작하기 위해서는 Google Assistant API 및 Tuya Smart Cloud API를 이용한  
Apple HomeBridge 구축 작업하여야 하며, 해당 내용은 Pre-installation을 참조하세요.

해당 프로젝트를 통해 각 서비스 별 관리 방법이 다른 기존 IOT Device들을 API를 이용해 HomeBridge를 구축하여 내부망 Bridge로 통합하고  
외부에서의 접근 가능한 API 서버를 제작해 어디에서나 모바일 기기를 이용한 접근이 가능한 기능을 구성하였다.

해당 API 서버에 접근하기 위해서는 NGINX auth token을 기반으로 인증 절차를 거치고 외부망→내부망으로 요청을 보내도록 하는 백엔드 프로젝트이다.

# Pre-installation

외부망 API 서버를 구동하기 위한 내부망 bridge 설치 작업으로 자세한 사항은 

[homebridge/homebridge](https://github.com/homebridge/homebridge)의 [README.md](https://github.com/homebridge/homebridge/blob/master/README.md)를 참고하세요.

# How to install

### Docker

준비 중

### NPM

준비 중

### Python

준비 중

# How to use home-api
git clone https://github.com/Solrukas/smart-home.git  
sudo npm install  
cd server  
node server.js  
  
자세한 내용은 server의 [README.md](https://github.com/Solrukas/smart-home/tree/master/server)를 참고하세요.

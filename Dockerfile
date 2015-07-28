FROM ubuntu:14.04
MAINTAINER Amit Gandhi <amit@gandhi.co.nz>

RUN apt-get -qq update
RUN apt-get -qq upgrade

# Install npm
RUN apt-get -qqy install npm curl libavahi-compat-libdnssd-dev git

RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

RUN curl -sL https://deb.nodesource.com/setup_0.12 | sudo bash -
RUN apt-get install -qqy nodejs

RUN git clone https://github.com/nfarina/homebridge.git /usr/src/app
RUN npm install

COPY config.json /usr/src/app/

CMD [ "npm", "start" ]

EXPOSE 51826


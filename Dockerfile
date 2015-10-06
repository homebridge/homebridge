FROM node:4.1-wheezy

RUN apt-get update -y && \
    apt-get upgrade -y && \
    apt-get install -y libavahi-compat-libdnssd-dev && \
    apt-get -y autoremove && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

COPY package.json /usr/src/app/
RUN npm install
COPY . /usr/src/app

EXPOSE 51826:51999

CMD [ "npm", "start" ]

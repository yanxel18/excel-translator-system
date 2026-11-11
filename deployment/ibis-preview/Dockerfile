FROM alpine:3.22 AS download
RUN apk add --no-cache ca-certificates curl unzip
ARG IBIS_VERSION=0.8.6
ARG IBIS_SHA256=051760c71c5625efa67c4d4c63fef44c5f7b248d0cde2ebd6d819dccda87ae7d
WORKDIR /tmp/ibis
RUN curl -fsSLO "https://github.com/ibisjp/ibis-office/releases/download/v${IBIS_VERSION}/ibisOffice-${IBIS_VERSION}-Web.zip" \
    && echo "${IBIS_SHA256}  ibisOffice-${IBIS_VERSION}-Web.zip" | sha256sum -c - \
    && unzip "ibisOffice-${IBIS_VERSION}-Web.zip" -d /www \
    && rm "ibisOffice-${IBIS_VERSION}-Web.zip"

FROM nginx:1.29-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=download /www/ /usr/share/nginx/html/
EXPOSE 80

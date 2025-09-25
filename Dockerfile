# Dockerfile
FROM alpine:3.19

RUN apk add --no-cache curl unzip bash \
    && curl -fsSL https://releases.hashicorp.com/terraform/1.9.5/terraform_1.9.5_linux_amd64.zip -o terraform.zip \
    && unzip terraform.zip \
    && mv terraform /usr/local/bin/ \
    && rm terraform.zip

WORKDIR /app
ENTRYPOINT ["/bin/bash"]

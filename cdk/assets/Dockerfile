# TODO - in pgorgress
FROM ubuntu:18.04

ARG version=v1.0.1
LABEL version=${version}

RUN apt-get update && \
    apt-get install --no-install-recommends -y \
    git ca-certificates iproute2 can-utils jq sed && \
    apt-get clean
WORKDIR /root
VOLUME ./bin /output
RUN git clone --depth 1 --branch ${version} https://github.com/aws/aws-iot-fleetwise-edge.git
RUN cd /root/aws-iot-fleetwise-edge/ && \
    sed -i 's/sudo//g' ./tools/install-deps-native.sh && \
    ./tools/install-deps-native.sh && \
    ./tools/build-fwe-native.sh

RUN mkdir /output && \
    cp /root/aws-iot-fleetwise-edge/build/src/executionmanagement/aws-iot-fleetwise-edge /output
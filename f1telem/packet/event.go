package packet

import (
	"bytes"
	"encoding/binary"
	"fmt"
)

type pktEventData struct {
	M_eventStringCode [4]byte
	M_eventDetails    [36]byte
}

func ParsePacket() bool {
	fmt.Print("got here")
	return true
}

func EventType(pkt []byte) int {
	var header pktHeader
	wrappedReader := bytes.NewReader(pkt[:24])
	err := binary.Read(wrappedReader, binary.LittleEndian, &header)
	if err != nil {
		fmt.Println(err)
	}
	return int(header.M_packetId)
}

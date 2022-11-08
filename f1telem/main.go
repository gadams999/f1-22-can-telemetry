package main

import (
	"fmt"
	"net"

	"github.com/gadams999/f1telem/packet"
)

func main() {
	PORT := ":22222"

	s, err := net.ResolveUDPAddr("udp4", PORT)
	if err != nil {
		fmt.Println(err)
		return
	}

	connection, err := net.ListenUDP("udp4", s)
	if err != nil {
		fmt.Println(err)
		return
	}

	defer connection.Close()
	buffer := make([]byte, 2048)

	for {
		// Read into buffer
		n, addr, err := connection.ReadFromUDP(buffer)
		if err != nil {
			fmt.Print("read udp failed", n, addr, err)
			continue
		}
		// fmt.Print("INP (size: ", n, ") -> ", buffer[:n], "\n")
		eventType := packet.EventType(buffer)
		fmt.Print("EVENT type: -> ", eventType, "\n")
		if eventType == 0 {
			motionData, err := packet.MotionPacket(buffer)
			if err != nil {
				fmt.Print("Error parsing motion packet ", err)
			}
			// fmt.Print("Motion packet: -> ", motionData, "\n")
			fmt.Printf("%#v\n\n", motionData)
		}
	}
}

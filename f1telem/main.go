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
		// Read  UDP packet into buffer
		n, addr, err := connection.ReadFromUDP(buffer)
		if err != nil {
			fmt.Print("read udp failed", n, addr, err)
			continue
		}

		// If event type is 6 (telemetry) process
		eventType := packet.EventType(buffer)
		if eventType == 6 {
			telemetryData, err := packet.TelemetryPacket(buffer)
			if err != nil {
				fmt.Print("Error parsing telemetry packet ", err)
			}

			// Read the player's car telemetry
			playerData, err := packet.PlayerData(telemetryData)
			if err != nil {
				fmt.Print("Error getting player data ", err)
			}
			fmt.Printf("%#v\n\n", playerData)
		}
	}
}

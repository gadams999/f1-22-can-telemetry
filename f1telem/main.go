package main

import (
	"fmt"
	"log"
	"net"
	"os"
	"os/signal"
	"syscall"

	"github.com/gadams999/f1telem/packet"
)

func main() {
	log.Print("Starting f1telem service")

	// Setup run as service
	gracefulShutdown := make(chan os.Signal, 1)
	signal.Notify(gracefulShutdown, syscall.SIGINT, syscall.SIGTERM)

	go func() {
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
				SendToCan(playerData)
			}
		}
	}()

	<-gracefulShutdown
	log.Print("Stopping f1telem service")
}

func SendToCan(telem packet.PlayerTelemetryData) {
	var speed_obd2 uint8
	var speed_custom uint16

	if telem.CarTelemetryData.M_speed <= 255 {
		speed_obd2 = uint8(telem.CarTelemetryData.M_speed)
	} else {
		speed_obd2 = 255
	}
	speed_custom = telem.CarTelemetryData.M_speed
	fmt.Printf("speed (obd2 - custom), %d - %d\n", speed_obd2, speed_custom)
}

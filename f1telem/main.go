package main

import (
	"context"
	"fmt"
	"log"
	"net"
	"os"
	"os/signal"
	"syscall"

	"github.com/gadams999/f1telem/packet"
	"go.einride.tech/can"
	"go.einride.tech/can/pkg/socketcan"
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
			log.Println(err)
			return
		}

		connection, err := net.ListenUDP("udp4", s)
		if err != nil {
			log.Println(err)
			return
		}

		canCon, err := socketcan.DialContext(context.Background(), "can", "vcan0")
		if err != nil {
			log.Println(err)
			return
		}

		defer connection.Close()
		buffer := make([]byte, 2048)

		for {
			// Read  UDP packet into buffer
			n, addr, err := connection.ReadFromUDP(buffer)
			if err != nil {
				log.Println("read udp failed", n, addr, err)
				continue
			}

			// If event type is 6 (telemetry) process
			eventType := packet.EventType(buffer)
			if eventType == 6 {
				telemetryData, err := packet.TelemetryPacket(buffer)
				if err != nil {
					log.Println("Error parsing telemetry packet ", err)
				}

				// Read the player's car telemetry
				playerData, err := packet.PlayerData(telemetryData)
				if err != nil {
					log.Println("Error getting player data ", err)
				}
				SendToCan(playerData, canCon)
			}
		}
	}()

	<-gracefulShutdown
	log.Print("Stopping f1telem service")
}

func SendToCan(telem packet.PlayerTelemetryData, conn net.Conn) {
	var speed_obd2 uint8
	var speed_custom uint16
	var frame can.Frame

	if telem.CarTelemetryData.M_speed <= 255 {
		speed_obd2 = uint8(telem.CarTelemetryData.M_speed)
	} else {
		speed_obd2 = 255
	}
	speed_custom = telem.CarTelemetryData.M_speed
	fmt.Printf("speed (obd2 - custom), %d - %d\n", speed_obd2, speed_custom)

	frame.ID = 0xd
	frame.Length = 1
	frame.Data.SetUnsignedBitsLittleEndian(0, 1, uint64(speed_obd2))

	tx := socketcan.NewTransmitter(conn)
	_ = tx.TransmitFrame(context.Background(), frame)

}

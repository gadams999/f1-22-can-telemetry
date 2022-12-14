package main

import (
	"context"
	"encoding/binary"
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
				playerData, err := packet.GetPlayerTelemetryData(telemetryData)
				if err != nil {
					log.Println("Error getting player data ", err)
				}
				SendToCanTelemetry(playerData, canCon)
			} else if eventType == 7 {
				statusData, err := packet.StatusPacket(buffer)
				if err != nil {
					log.Println("Error parsing car status packet ", err)
				}
				// Read the player's car status
				playerData, err := packet.GetPlayerStatusData(statusData)
				if err != nil {
					log.Println("Error getting player data ", err)
				}
				SendToCanStatus(playerData, canCon)
			}
		}
	}()

	<-gracefulShutdown
	log.Print("Stopping f1telem service")
}

func SendToCanTelemetry(telem packet.PlayerTelemetryData, conn net.Conn) {
	var speed_obd2 uint8
	var speed uint16
	var rpm_obd2 uint16
	var throttle_obd2 uint8
	var engine_coolant_temperature_obd2 uint8
	var frame can.Frame
	tx := socketcan.NewTransmitter(conn)

	// Calculate speeds

	// Write OBDII speed
	if telem.CarTelemetryData.M_speed <= 255 {
		speed_obd2 = uint8(telem.CarTelemetryData.M_speed)
	} else {
		speed_obd2 = 255
	}
	frame.ID = 0x400
	frame.Length = 1
	UnsignedBigEndianToCanFrame(&frame, uint64(speed_obd2))
	_ = tx.TransmitFrame(context.Background(), frame)

	// Write Custom speed to CAN
	frame.ID = 0x401
	frame.Length = 2
	speed = (uint16)(float32(telem.CarTelemetryData.M_speed) / 0.1)
	UnsignedBigEndianToCanFrame(&frame, uint64(speed))
	_ = tx.TransmitFrame(context.Background(), frame)

	// Write the RPM value to CAN
	frame.ID = 0x402
	frame.Length = 2
	rpm_obd2 = (uint16)(float32(telem.CarTelemetryData.M_engineRPM) / 0.25)
	UnsignedBigEndianToCanFrame(&frame, uint64(rpm_obd2))
	_ = tx.TransmitFrame(context.Background(), frame)

	// Write Throttle position to CAN
	frame.ID = 0x403
	frame.Length = 1
	throttle_obd2 = (uint8)(float32(telem.CarTelemetryData.M_throttle) / (1 / 2.55) * 100)
	UnsignedBigEndianToCanFrame(&frame, uint64(throttle_obd2))
	_ = tx.TransmitFrame(context.Background(), frame)

	// Write engine coolant temperature to CAN
	// OBD2 coolant = A - 40 (so add 40)
	frame.ID = 0x404
	frame.Length = 1
	engine_coolant_temperature_obd2 = (uint8)(telem.CarTelemetryData.M_engineTemperature + 40)
	UnsignedBigEndianToCanFrame(&frame, uint64(engine_coolant_temperature_obd2))
	_ = tx.TransmitFrame(context.Background(), frame)
}

func SendToCanStatus(status packet.PlayerStatusData, conn net.Conn) {
	var fuel_capacity uint16 // fuel capacity
	var fuel_mass uint16     // current fuel mass (fuel in tank)
	var frame can.Frame
	tx := socketcan.NewTransmitter(conn)

	// Write fuel capacity to CAN (max fuel in liters)
	frame.ID = 0x405
	frame.Length = 2
	fuel_capacity = (uint16)(float32(status.CarStatusData.M_fuelCapacity) / 0.01)
	UnsignedBigEndianToCanFrame(&frame, uint64(fuel_capacity))
	_ = tx.TransmitFrame(context.Background(), frame)

	// Write current fuel mass to CAN (current fuel in liters)
	frame.ID = 0x406
	frame.Length = 2
	fuel_mass = (uint16)(float32(status.CarStatusData.M_fuelInTank) / 0.01)
	UnsignedBigEndianToCanFrame(&frame, uint64(fuel_mass))
	// log.Println("status CAN frame is", frame)
	_ = tx.TransmitFrame(context.Background(), frame)
}

// Copy the Unsigned value to the CAN frame in big endian format
func UnsignedBigEndianToCanFrame(frame *can.Frame, value uint64) {
	buf := make([]byte, frame.Length)
	switch frame.Length {
	case 1:
		buf[0] = uint8(value)
	case 2:
		binary.BigEndian.PutUint16(buf, uint16(value))
	case 4:
		binary.BigEndian.PutUint32(buf, uint32(value))
	case 8:
		binary.BigEndian.PutUint64(buf, uint64(value))
	}
	copy(frame.Data[:frame.Length], buf)
}

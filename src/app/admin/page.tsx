"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Link from "next/link";

interface Committee {
  id: string;
  name: string;
  color: string;
  points: number;
}

interface Member {
  id: string;
  name: string;
  email: string;
  type: string;
  points: number;
  committees: { committee: Committee }[];
}

interface Event {
  id: string;
  name: string;
  description: string | null;
  points: number;
  date: string;
  attendances: { member: Member }[];
}

export default function AdminPage() {
  const [committees, setCommittees] = useState<Committee[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [newCommittee, setNewCommittee] = useState({ name: "", color: "#1e3a5f" });
  const [newMember, setNewMember] = useState({
    name: "",
    email: "",
    type: "activo",
    committeeIds: [] as string[],
  });
  const [newEvent, setNewEvent] = useState({
    name: "",
    description: "",
    points: "",
    date: "",
  });
  const [selectedEventForPoints, setSelectedEventForPoints] = useState<Event | null>(null);
  const [selectedMembersForPoints, setSelectedMembersForPoints] = useState<string[]>([]);

  // Dialog states
  const [committeeDialogOpen, setCommitteeDialogOpen] = useState(false);
  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [pointsDialogOpen, setPointsDialogOpen] = useState(false);

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    try {
      const [committeesRes, membersRes, eventsRes] = await Promise.all([
        fetch("/api/committees"),
        fetch("/api/members"),
        fetch("/api/events"),
      ]);

      setCommittees(await committeesRes.json());
      setMembers(await membersRes.json());
      setEvents(await eventsRes.json());
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  // Committee handlers
  const handleCreateCommittee = async () => {
    try {
      await fetch("/api/committees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newCommittee),
      });
      setNewCommittee({ name: "", color: "#1e3a5f" });
      setCommitteeDialogOpen(false);
      fetchAllData();
    } catch (error) {
      console.error("Error creating committee:", error);
    }
  };

  const handleDeleteCommittee = async (id: string) => {
    if (!confirm("Seguro que quieres eliminar este comite?")) return;
    try {
      await fetch(`/api/committees/${id}`, { method: "DELETE" });
      fetchAllData();
    } catch (error) {
      console.error("Error deleting committee:", error);
    }
  };

  // Member handlers
  const handleCreateMember = async () => {
    try {
      await fetch("/api/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newMember),
      });
      setNewMember({ name: "", email: "", type: "activo", committeeIds: [] });
      setMemberDialogOpen(false);
      fetchAllData();
    } catch (error) {
      console.error("Error creating member:", error);
    }
  };

  const handleDeleteMember = async (id: string) => {
    if (!confirm("Seguro que quieres eliminar este miembro?")) return;
    try {
      await fetch(`/api/members/${id}`, { method: "DELETE" });
      fetchAllData();
    } catch (error) {
      console.error("Error deleting member:", error);
    }
  };

  // Event handlers
  const handleCreateEvent = async () => {
    try {
      await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newEvent),
      });
      setNewEvent({ name: "", description: "", points: "", date: "" });
      setEventDialogOpen(false);
      fetchAllData();
    } catch (error) {
      console.error("Error creating event:", error);
    }
  };

  const handleDeleteEvent = async (id: string) => {
    if (!confirm("Seguro que quieres eliminar este evento?")) return;
    try {
      await fetch(`/api/events/${id}`, { method: "DELETE" });
      fetchAllData();
    } catch (error) {
      console.error("Error deleting event:", error);
    }
  };

  // Points assignment
  const handleAssignPoints = async () => {
    if (!selectedEventForPoints || selectedMembersForPoints.length === 0) return;

    try {
      await fetch(`/api/events/${selectedEventForPoints.id}/attendance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberIds: selectedMembersForPoints }),
      });
      setSelectedEventForPoints(null);
      setSelectedMembersForPoints([]);
      setPointsDialogOpen(false);
      fetchAllData();
    } catch (error) {
      console.error("Error assigning points:", error);
    }
  };

  const toggleMemberSelection = (memberId: string) => {
    setSelectedMembersForPoints((prev) =>
      prev.includes(memberId)
        ? prev.filter((id) => id !== memberId)
        : [...prev, memberId]
    );
  };

  const toggleCommitteeSelection = (committeeId: string) => {
    setNewMember((prev) => ({
      ...prev,
      committeeIds: prev.committeeIds.includes(committeeId)
        ? prev.committeeIds.filter((id) => id !== committeeId)
        : [...prev.committeeIds, committeeId],
    }));
  };

  if (loading) {
    return (
      <div className="min-h-screen gradient-bg flex items-center justify-center">
        <div className="text-white text-2xl animate-pulse">Cargando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="gradient-bg text-white py-8 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold">Panel de Administracion</h1>
              <p className="opacity-75">GH Points - EAFIT 2026</p>
            </div>
            <Link
              href="/"
              className="bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg transition-colors"
            >
              Ver Podio
            </Link>
          </div>
        </div>
      </header>

      {/* Stats */}
      <div className="max-w-6xl mx-auto px-4 -mt-6">
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-night-blue">
                {members.length}
              </div>
              <p className="text-muted-foreground">Miembros</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-mustard">
                {committees.length}
              </div>
              <p className="text-muted-foreground">Comites</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-sky-blue">
                {events.length}
              </div>
              <p className="text-muted-foreground">Eventos</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        <Tabs defaultValue="committees" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="committees">Comites</TabsTrigger>
            <TabsTrigger value="members">Miembros</TabsTrigger>
            <TabsTrigger value="events">Eventos</TabsTrigger>
            <TabsTrigger value="points">Asignar Puntos</TabsTrigger>
          </TabsList>

          {/* Committees Tab */}
          <TabsContent value="committees">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Comites</CardTitle>
                <Dialog open={committeeDialogOpen} onOpenChange={setCommitteeDialogOpen}>
                  <DialogTrigger asChild>
                    <Button className="bg-night-blue hover:bg-night-blue/90">
                      + Agregar Comite
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Nuevo Comite</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                      <div>
                        <Label>Nombre</Label>
                        <Input
                          value={newCommittee.name}
                          onChange={(e) =>
                            setNewCommittee({ ...newCommittee, name: e.target.value })
                          }
                          placeholder="Nombre del comite"
                        />
                      </div>
                      <div>
                        <Label>Color</Label>
                        <Input
                          type="color"
                          value={newCommittee.color}
                          onChange={(e) =>
                            setNewCommittee({ ...newCommittee, color: e.target.value })
                          }
                        />
                      </div>
                      <Button onClick={handleCreateCommittee} className="w-full bg-mustard hover:bg-orange">
                        Crear Comite
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Color</TableHead>
                      <TableHead>Puntos</TableHead>
                      <TableHead>Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {committees.map((committee) => (
                      <TableRow key={committee.id}>
                        <TableCell className="font-medium">{committee.name}</TableCell>
                        <TableCell>
                          <div
                            className="w-6 h-6 rounded"
                            style={{ backgroundColor: committee.color }}
                          />
                        </TableCell>
                        <TableCell>
                          <Badge className="bg-mustard">{committee.points} pts</Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDeleteCommittee(committee.id)}
                          >
                            Eliminar
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Members Tab */}
          <TabsContent value="members">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Miembros ({members.length})</CardTitle>
                <Dialog open={memberDialogOpen} onOpenChange={setMemberDialogOpen}>
                  <DialogTrigger asChild>
                    <Button className="bg-night-blue hover:bg-night-blue/90">
                      + Agregar Miembro
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg">
                    <DialogHeader>
                      <DialogTitle>Nuevo Miembro</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                      <div>
                        <Label>Nombre</Label>
                        <Input
                          value={newMember.name}
                          onChange={(e) =>
                            setNewMember({ ...newMember, name: e.target.value })
                          }
                          placeholder="Nombre completo"
                        />
                      </div>
                      <div>
                        <Label>Correo electronico</Label>
                        <Input
                          type="email"
                          value={newMember.email}
                          onChange={(e) =>
                            setNewMember({ ...newMember, email: e.target.value })
                          }
                          placeholder="correo@eafit.edu.co"
                        />
                      </div>
                      <div>
                        <Label>Tipo</Label>
                        <Select
                          value={newMember.type}
                          onValueChange={(value) =>
                            setNewMember({ ...newMember, type: value })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="activo">Activo</SelectItem>
                            <SelectItem value="nuevo">Nuevo</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Comites</Label>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {committees.map((committee) => (
                            <Badge
                              key={committee.id}
                              variant={
                                newMember.committeeIds.includes(committee.id)
                                  ? "default"
                                  : "outline"
                              }
                              className="cursor-pointer"
                              onClick={() => toggleCommitteeSelection(committee.id)}
                            >
                              {committee.name}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <Button onClick={handleCreateMember} className="w-full bg-mustard hover:bg-orange">
                        Crear Miembro
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Comites</TableHead>
                      <TableHead>Puntos</TableHead>
                      <TableHead>Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {members.map((member) => (
                      <TableRow key={member.id}>
                        <TableCell className="font-medium">{member.name}</TableCell>
                        <TableCell>{member.email}</TableCell>
                        <TableCell>
                          <Badge variant={member.type === "activo" ? "default" : "secondary"}>
                            {member.type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {member.committees.map((mc) => (
                              <Badge key={mc.committee.id} variant="outline" className="text-xs">
                                {mc.committee.name}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className="bg-mustard">{member.points} pts</Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDeleteMember(member.id)}
                          >
                            Eliminar
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Events Tab */}
          <TabsContent value="events">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Eventos</CardTitle>
                <Dialog open={eventDialogOpen} onOpenChange={setEventDialogOpen}>
                  <DialogTrigger asChild>
                    <Button className="bg-night-blue hover:bg-night-blue/90">
                      + Agregar Evento
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Nuevo Evento</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                      <div>
                        <Label>Nombre</Label>
                        <Input
                          value={newEvent.name}
                          onChange={(e) =>
                            setNewEvent({ ...newEvent, name: e.target.value })
                          }
                          placeholder="Nombre del evento"
                        />
                      </div>
                      <div>
                        <Label>Descripcion</Label>
                        <Input
                          value={newEvent.description}
                          onChange={(e) =>
                            setNewEvent({ ...newEvent, description: e.target.value })
                          }
                          placeholder="Descripcion opcional"
                        />
                      </div>
                      <div>
                        <Label>GH Points</Label>
                        <Input
                          type="number"
                          value={newEvent.points}
                          onChange={(e) =>
                            setNewEvent({ ...newEvent, points: e.target.value })
                          }
                          placeholder="Puntos por asistencia"
                        />
                      </div>
                      <div>
                        <Label>Fecha</Label>
                        <Input
                          type="datetime-local"
                          value={newEvent.date}
                          onChange={(e) =>
                            setNewEvent({ ...newEvent, date: e.target.value })
                          }
                        />
                      </div>
                      <Button onClick={handleCreateEvent} className="w-full bg-mustard hover:bg-orange">
                        Crear Evento
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Descripcion</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Puntos</TableHead>
                      <TableHead>Asistentes</TableHead>
                      <TableHead>Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {events.map((event) => (
                      <TableRow key={event.id}>
                        <TableCell className="font-medium">{event.name}</TableCell>
                        <TableCell>{event.description || "-"}</TableCell>
                        <TableCell>
                          {new Date(event.date).toLocaleDateString("es-CO")}
                        </TableCell>
                        <TableCell>
                          <Badge className="bg-sky-blue">{event.points} pts</Badge>
                        </TableCell>
                        <TableCell>{event.attendances?.length || 0}</TableCell>
                        <TableCell>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDeleteEvent(event.id)}
                          >
                            Eliminar
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Points Assignment Tab */}
          <TabsContent value="points">
            <Card>
              <CardHeader>
                <CardTitle>Asignar GH Points</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <Label>Selecciona un evento</Label>
                  <Select
                    value={selectedEventForPoints?.id || ""}
                    onValueChange={(value) => {
                      const event = events.find((e) => e.id === value);
                      setSelectedEventForPoints(event || null);
                      setSelectedMembersForPoints([]);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona un evento..." />
                    </SelectTrigger>
                    <SelectContent>
                      {events.map((event) => (
                        <SelectItem key={event.id} value={event.id}>
                          {event.name} (+{event.points} pts)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedEventForPoints && (
                  <>
                    <div>
                      <Label>
                        Selecciona los miembros que asistieron ({selectedMembersForPoints.length} seleccionados)
                      </Label>
                      <div className="border rounded-lg mt-2 max-h-96 overflow-y-auto">
                        {members.map((member) => {
                          const alreadyAttended = selectedEventForPoints.attendances?.some(
                            (a) => a.member.id === member.id
                          );
                          return (
                            <div
                              key={member.id}
                              className={`flex items-center gap-3 p-3 border-b last:border-b-0 cursor-pointer hover:bg-muted/50 ${
                                selectedMembersForPoints.includes(member.id)
                                  ? "bg-mustard/10"
                                  : ""
                              } ${alreadyAttended ? "opacity-50" : ""}`}
                              onClick={() => !alreadyAttended && toggleMemberSelection(member.id)}
                            >
                              <input
                                type="checkbox"
                                checked={selectedMembersForPoints.includes(member.id)}
                                disabled={alreadyAttended}
                                readOnly
                                className="w-4 h-4"
                              />
                              <div className="flex-1">
                                <p className="font-medium">{member.name}</p>
                                <p className="text-sm text-muted-foreground">{member.email}</p>
                              </div>
                              <Badge variant={member.type === "activo" ? "default" : "secondary"}>
                                {member.type}
                              </Badge>
                              {alreadyAttended && (
                                <Badge variant="outline" className="text-green-600">
                                  Ya asistio
                                </Badge>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <Button
                      onClick={handleAssignPoints}
                      disabled={selectedMembersForPoints.length === 0}
                      className="w-full bg-mustard hover:bg-orange"
                    >
                      Asignar {selectedEventForPoints.points} GH Points a {selectedMembersForPoints.length} miembros
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
